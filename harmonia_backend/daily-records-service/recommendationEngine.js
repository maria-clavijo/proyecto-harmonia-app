const axios = require('axios');

class RecommendationEngine {
  constructor() {
    this.exerciseCategories = {
      breathing: ['respiracion-4-7-8', 'respiracion-cuadrada'],
      mindfulness: ['meditacion-mindfulness-5min', 'body-scan-relajacion'],
      sound: ['sonidos-naturaleza-lluvia', 'sonidos-bosque-relajante'],
      movement: ['yoga-cara-alivio-estres', 'estiramientos-sueno']
    };
  }

  /**
   * Genera recomendaciones personalizadas basadas en el perfil de estrés
   */
  async generateRecommendations(userId, stressPrediction, historicalData = []) {
    try {
      const recommendations = [];
      const stressLevel = stressPrediction.level;
      const mainFactors = stressPrediction.factors.map(f => f.factor);

      // Recomendación principal basada en nivel de estrés
      recommendations.push(...await this.getStressLevelRecommendations(stressLevel, userId));

      // Recomendaciones específicas por factores
      recommendations.push(...await this.getFactorBasedRecommendations(mainFactors, userId));

      // Recomendaciones preventivas basadas en historial
      recommendations.push(...await this.getPreventiveRecommendations(historicalData, userId));

      // Ordenar por prioridad y eliminar duplicados
      return this.deduplicateAndSort(recommendations);
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return this.getFallbackRecommendations(stressPrediction.level);
    }
  }

  /**
   * Recomendaciones basadas en nivel de estrés
   */
  async getStressLevelRecommendations(stressLevel, userId) {
    const recommendations = [];

    switch (stressLevel) {
      case 'low':
        recommendations.push({
          type: 'mindfulness',
          title: 'Mantener el equilibrio',
          description: 'Continúa con tus prácticas de mindfulness para mantener tu bienestar actual.',
          priority: 2,
          duration_minutes: 10
        });
        break;

      case 'medium':
        recommendations.push({
          type: 'breathing',
          title: 'Respiración para el equilibrio',
          description: 'Practica respiración consciente para manejar el estrés moderado.',
          priority: 3,
          duration_minutes: 5
        });
        break;

      case 'high':
        recommendations.push({
          type: 'exercise',
          title: 'Ejercicio de relajación urgente',
          description: 'Realiza este ejercicio para reducir los niveles elevados de estrés.',
          priority: 4,
          duration_minutes: 15
        });
        recommendations.push({
          type: 'lifestyle',
          title: 'Descanso activo',
          description: 'Considera tomar descansos cortos cada hora durante tu jornada.',
          priority: 3,
          duration_minutes: null
        });
        break;

      case 'critical':
        recommendations.push({
          type: 'urgent',
          title: 'Atención inmediata necesaria',
          description: 'Niveles de estrés críticos detectados. Practica técnicas de grounding inmediatamente.',
          priority: 5,
          duration_minutes: 20
        });
        recommendations.push({
          type: 'breathing',
          title: 'Respiración de emergencia',
          description: 'Técnica 4-7-8 para calmar el sistema nervioso rápidamente.',
          priority: 5,
          duration_minutes: 5
        });
        break;
    }

    // Añadir ejercicios específicos
    await this.addExerciseRecommendations(recommendations, stressLevel, userId);

    return recommendations;
  }

  /**
   * Recomendaciones basadas en factores específicos
   */
  async getFactorBasedRecommendations(factors, userId) {
    const recommendations = [];

    for (const factor of factors) {
      switch (factor) {
        case 'sleep':
          recommendations.push({
            type: 'lifestyle',
            title: 'Higiene del sueño',
            description: 'Mejora tu rutina de sueño con estas prácticas recomendadas.',
            priority: 3,
            duration_minutes: null
          });
          break;

        case 'activity':
          recommendations.push({
            type: 'exercise',
            title: 'Actividad física moderada',
            description: 'Incorpora caminatas cortas durante el día para aumentar tu actividad.',
            priority: 3,
            duration_minutes: 10
          });
          break;

        case 'mood':
          recommendations.push({
            type: 'mindfulness',
            title: 'Regulación emocional',
            description: 'Practica la observación sin juicio de tus emociones.',
            priority: 4,
            duration_minutes: 8
          });
          break;
      }
    }

    return recommendations;
  }

  /**
   * Recomendaciones preventivas basadas en historial
   */
  async getPreventiveRecommendations(historicalData, userId) {
    if (historicalData.length < 3) return [];

    const recentStressLevels = historicalData
      .slice(-5)
      .map(record => record.stress_prediction?.level)
      .filter(level => level);

    const highStressDays = recentStressLevels.filter(level => 
      ['high', 'critical'].includes(level)
    ).length;

    if (highStressDays >= 3) {
      return [{
        type: 'lifestyle',
        title: 'Patrón de estrés detectado',
        description: 'Has tenido varios días de alto estrés. Considera ajustar tu rutina semanal.',
        priority: 4,
        duration_minutes: null
      }];
    }

    return [];
  }

  /**
   * Añade ejercicios específicos a las recomendaciones
   */
  async addExerciseRecommendations(recommendations, stressLevel, userId) {
    try {
      let category;
      
      switch (stressLevel) {
        case 'low':
          category = 'mindfulness';
          break;
        case 'medium':
          category = 'breathing';
          break;
        case 'high':
          category = 'movement';
          break;
        case 'critical':
          category = 'breathing';
          break;
        default:
          category = 'mindfulness';
      }

      // Obtener ejercicios del servicio de ejercicios
      const response = await axios.get(
        `http://localhost:${process.env.EXERCISES_SERVICE_PORT || 3004}/exercises`,
        {
          params: { 
            category: category,
            limit: 2
          }
        }
      );

      if (response.data.exercises && response.data.exercises.length > 0) {
        const exercise = response.data.exercises[0];
        const exerciseRec = recommendations.find(rec => rec.type === 'exercise' || rec.type === 'breathing');
        
        if (exerciseRec) {
          exerciseRec.exercise_id = exercise._id;
          exerciseRec.title = exercise.title;
          exerciseRec.duration_minutes = Math.ceil(exercise.duration_seconds / 60);
        }
      }
    } catch (error) {
      console.error('Error fetching exercises for recommendations:', error);
    }
  }

  /**
   * Elimina duplicados y ordena por prioridad
   */
  deduplicateAndSort(recommendations) {
    const seen = new Set();
    const unique = recommendations.filter(rec => {
      const key = `${rec.type}-${rec.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique.sort((a, b) => b.priority - a.priority).slice(0, 5); // Máximo 5 recomendaciones
  }

  /**
   * Recomendaciones de respaldo
   */
  getFallbackRecommendations(stressLevel) {
    return [{
      type: 'breathing',
      title: 'Respiración consciente',
      description: 'Toma 5 minutos para enfocarte en tu respiración.',
      priority: 3,
      duration_minutes: 5
    }];
  }
}

module.exports = new RecommendationEngine();

