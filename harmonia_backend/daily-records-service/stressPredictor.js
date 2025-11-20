class StressPredictor {
  constructor() {
    this.modelVersion = '1.2'; // Versión actualizada
    this.factorsWeights = {
      sleep: 0.25,
      activity: 0.20,
      mood: 0.30,
      consistency: 0.15,
      historical: 0.10
    };
  }

  /**
   * Predice el nivel de estrés basado en múltiples factores
   */
  async predictStress(userId, currentData, historicalData = []) {
    try {
      console.log(`PredictStress iniciado para usuario: ${userId}`);
      
      // Validar datos de entrada - CORREGIDO
      if (!currentData) {
        console.warn('currentData es null o undefined, usando datos por defecto');
        return this.getDefaultPrediction();
      }

      // Calcular factores individuales con validación robusta
      const sleepScore = this.calculateSleepScore(currentData.wellbeing?.sleep_hours);
      const activityScore = this.calculateActivityScore(currentData.wellbeing?.steps);
      const moodScore = this.calculateMoodScore(currentData.mood_entries);
      const consistencyScore = this.calculateConsistencyScore(historicalData);
      const historicalScore = this.calculateHistoricalStressScore(historicalData);

      console.log(`Scores calculados:`, {
        sleep: sleepScore,
        activity: activityScore,
        mood: moodScore,
        consistency: consistencyScore,
        historical: historicalScore
      });

      // Calcular score total ponderado con validación
      const totalScore = this.calculateTotalScore({
        sleep: sleepScore,
        activity: activityScore,
        mood: moodScore,
        consistency: consistencyScore,
        historical: historicalScore
      });

      // Determinar nivel de estrés
      const stressLevel = this.determineStressLevel(totalScore);
      
      // Identificar factores principales
      const factors = this.identifyKeyFactors({
        sleep: sleepScore,
        activity: activityScore,
        mood: moodScore,
        consistency: consistencyScore,
        historical: historicalScore
      }, totalScore);

      // Calcular confianza basada en datos disponibles
      const confidence = this.calculateConfidence(currentData, historicalData);

      const prediction = {
        score: totalScore,
        level: stressLevel,
        factors: factors,
        confidence: confidence,
        model_version: this.modelVersion,
        breakdown: {
          sleep: sleepScore,
          activity: activityScore,
          mood: moodScore,
          consistency: consistencyScore,
          historical: historicalScore
        },
        generated_at: new Date()
      };

      console.log(`Predicción completada: ${totalScore} (${stressLevel})`);
      return prediction;

    } catch (error) {
      console.error('Error crítico en predictStress:', error);
      // Retornar predicción por defecto en caso de error
      return this.getDefaultPrediction();
    }
  }

  /**
   * Calcula score basado en horas de sueño 
   */
  calculateSleepScore(sleepHours) {
    try {
      // Validación exhaustiva 
      if (sleepHours === undefined || sleepHours === null || sleepHours === 0 || isNaN(sleepHours)) {
        console.log('calculateSleepScore: datos de sueño no disponibles, usando valor por defecto');
        return 70; // Alto estrés si no hay datos
      }

      // Asegurar que es número
      const hours = Number(sleepHours);
      if (isNaN(hours)) return 70;

      if (hours >= 7 && hours <= 9) return 20; // Óptimo
      if (hours >= 6 && hours < 7) return 40; // Sub-óptimo
      if (hours > 9) return 50; // Demasiado sueño
      if (hours >= 5 && hours < 6) return 60; // Insuficiente
      return 80; // Muy insuficiente
    } catch (error) {
      console.error('Error en calculateSleepScore:', error);
      return 70; // Valor por defecto seguro
    }
  }

  /**
   * Calcula score basado en actividad física
   */
  calculateActivityScore(steps) {
    try {
      // Validación exhaustiva 
      if (steps === undefined || steps === null || steps === 0 || isNaN(steps)) {
        console.log('calculateActivityScore: datos de pasos no disponibles, usando valor por defecto');
        return 60; // Medio-alto si no hay datos
      }

      // Asegurar que es número
      const stepCount = Number(steps);
      if (isNaN(stepCount)) return 60;

      if (stepCount >= 8000) return 20; // Excelente
      if (stepCount >= 5000 && stepCount < 8000) return 40; // Bueno
      if (stepCount >= 3000 && stepCount < 5000) return 60; // Regular
      return 80; // Bajo
    } catch (error) {
      console.error('Error en calculateActivityScore:', error);
      return 60; // Valor por defecto seguro
    }
  }

  /**
   * Calcula score basado en estado de ánimo - CORREGIDO
   */
  calculateMoodScore(moodEntries) {
    try {
      // Validación exhaustiva - CORREGIDO
      if (!moodEntries || !Array.isArray(moodEntries) || moodEntries.length === 0) {
        console.log('calculateMoodScore: no hay entradas de ánimo, usando valor por defecto');
        return 50; // Neutral si no hay datos
      }

      const recentMoods = moodEntries
        .slice(-3) // Últimas 3 entradas
        .map(entry => {
          // Validar cada entrada - CORREGIDO
          if (!entry || typeof entry.mood_score !== 'number' || isNaN(entry.mood_score)) {
            return null;
          }
          return entry.mood_score;
        })
        .filter(score => score !== null && !isNaN(score)); // Filtrar valores inválidos

      if (recentMoods.length === 0) {
        console.log('calculateMoodScore: no hay puntajes de ánimo válidos');
        return 50;
      }

      const avgMood = recentMoods.reduce((sum, score) => sum + score, 0) / recentMoods.length;
      
      // Validar promedio
      if (isNaN(avgMood)) return 50;

      if (avgMood >= 80) return 20; // Muy bueno
      if (avgMood >= 60) return 40; // Bueno
      if (avgMood >= 40) return 60; // Neutral
      if (avgMood >= 20) return 80; // Malo
      return 90; // Muy malo
    } catch (error) {
      console.error('Error en calculateMoodScore:', error);
      return 50; // Valor por defecto seguro
    }
  }

  /**
   * Calcula consistencia en rutinas 
   */
  calculateConsistencyScore(historicalData) {
    try {
      // Validación de entrada 
      if (!historicalData || !Array.isArray(historicalData) || historicalData.length < 3) {
        console.log('calculateConsistencyScore: historial insuficiente');
        return 50; // Neutral si no hay suficiente historial
      }

      const recentRecords = historicalData.slice(-7); // Última semana
      const dataCompleteness = recentRecords.filter(record => 
        record && (
          (record.wellbeing && (record.wellbeing.sleep_hours || record.wellbeing.steps)) ||
          (record.mood_entries && record.mood_entries.length > 0)
        )
      ).length / recentRecords.length;

      const score = Math.round(100 - (dataCompleteness * 100));
      return isNaN(score) ? 50 : score;
    } catch (error) {
      console.error('Error en calculateConsistencyScore:', error);
      return 50; // Valor por defecto seguro
    }
  }

  /**
   * Calcula score basado en historial de estrés 
   */
  calculateHistoricalStressScore(historicalData) {
    try {
      // Validación de entrada 
      if (!historicalData || !Array.isArray(historicalData) || historicalData.length === 0) {
        return 50;
      }

      const recentStressScores = historicalData
        .slice(-5) // Últimos 5 días
        .map(record => {
          // Validar cada registro 
          if (!record || !record.stress_prediction || typeof record.stress_prediction.score !== 'number') {
            return null;
          }
          return record.stress_prediction.score;
        })
        .filter(score => score !== null && !isNaN(score));

      if (recentStressScores.length === 0) return 50;

      const average = recentStressScores.reduce((sum, score) => sum + score, 0) / recentStressScores.length;
      const roundedAverage = Math.round(average);
      
      return isNaN(roundedAverage) ? 50 : roundedAverage;
    } catch (error) {
      console.error('Error en calculateHistoricalStressScore:', error);
      return 50; // Valor por defecto seguro
    }
  }

  /**
   * Calcula el score total ponderado de forma segura
   */
  calculateTotalScore(scores) {
    try {
      let total = 0;
      let totalWeight = 0;

      // Calcular ponderación de forma segura
      for (const [factor, weight] of Object.entries(this.factorsWeights)) {
        const score = scores[factor];
        if (typeof score === 'number' && !isNaN(score)) {
          total += score * weight;
          totalWeight += weight;
        }
      }

      // Si no hay scores válidos, retornar valor por defecto
      if (totalWeight === 0) {
        console.warn('No hay scores válidos para calcular total');
        return 50;
      }

      const totalScore = Math.round(total / totalWeight);
      return Math.max(0, Math.min(100, totalScore)); // Asegurar entre 0-100
    } catch (error) {
      console.error('Error en calculateTotalScore:', error);
      return 50; // Valor por defecto seguro
    }
  }

  /**
   * Determina el nivel de estrés basado en el score 
   */
  determineStressLevel(score) {
    try {
      const normalizedScore = Number(score);
      if (isNaN(normalizedScore)) return 'medium';

      if (normalizedScore <= 30) return 'low';
      if (normalizedScore <= 50) return 'medium';
      if (normalizedScore <= 70) return 'high';
      return 'critical';
    } catch (error) {
      console.error('Error en determineStressLevel:', error);
      return 'medium'; // Nivel por defecto seguro
    }
  }

  /**
   * Identifica factores clave que contribuyen al estrés
   */
  identifyKeyFactors(scores, totalScore) {
    try {
      const factors = [];
      const threshold = 10; // Impacto mínimo

      // Validar inputs
      if (typeof totalScore !== 'number' || isNaN(totalScore)) {
        return [{
          factor: 'system',
          impact: 10,
          description: 'Análisis en progreso'
        }];
      }

      // Verificar cada factor
      const validFactors = ['sleep', 'activity', 'mood', 'consistency', 'historical'];
      
      validFactors.forEach(factor => {
        const score = scores[factor];
        if (typeof score === 'number' && !isNaN(score)) {
          const difference = Math.abs(score - totalScore);
          if (difference > threshold) {
            factors.push({
              factor: factor,
              impact: Math.min(30, Math.round(difference)), // Limitar impacto máximo
              description: this.getFactorDescription(factor, score)
            });
          }
        }
      });

      // Siempre incluir al menos el factor principal
      if (factors.length === 0) {
        const mainFactor = this.getMainFactor(scores);
        factors.push({
          factor: mainFactor,
          impact: 15,
          description: this.getFactorDescription(mainFactor, scores[mainFactor] || 50)
        });
      }

      // Ordenar por impacto (mayor primero)
      return factors.sort((a, b) => b.impact - a.impact).slice(0, 3); // Máximo 3 factores
    } catch (error) {
      console.error('Error en identifyKeyFactors:', error);
      return [{
        factor: 'system',
        impact: 10,
        description: 'Análisis de factores temporalmente no disponible'
      }];
    }
  }

  /**
   * Obtiene el factor principal 
   */
  getMainFactor(scores) {
    try {
      let mainFactor = 'mood'; // Por defecto
      let highestScore = 0;

      for (const [factor, score] of Object.entries(scores)) {
        if (typeof score === 'number' && score > highestScore) {
          highestScore = score;
          mainFactor = factor;
        }
      }

      return mainFactor;
    } catch (error) {
      return 'mood';
    }
  }

  /**
   * Obtiene descripción del factor 
   */
  getFactorDescription(factor, score) {
    const normalizedScore = typeof score === 'number' ? score : 50;

    switch (factor) {
      case 'sleep':
        if (normalizedScore <= 30) return 'Patrón de sueño saludable';
        if (normalizedScore <= 50) return 'Sueño ligeramente afectado';
        if (normalizedScore <= 70) return 'Problemas moderados de sueño';
        return 'Alteraciones severas del sueño';

      case 'activity':
        if (normalizedScore <= 30) return 'Nivel de actividad óptimo';
        if (normalizedScore <= 50) return 'Actividad física regular';
        if (normalizedScore <= 70) return 'Actividad física insuficiente';
        return 'Sedentarismo significativo';

      case 'mood':
        if (normalizedScore <= 30) return 'Estado de ánimo positivo';
        if (normalizedScore <= 50) return 'Estado de ánimo estable';
        if (normalizedScore <= 70) return 'Estado de ánimo afectado';
        return 'Estado de ánimo muy afectado';

      case 'consistency':
        if (normalizedScore <= 30) return 'Rutinas muy consistentes';
        if (normalizedScore <= 50) return 'Rutinas moderadamente consistentes';
        if (normalizedScore <= 70) return 'Rutinas irregulares';
        return 'Falta de rutinas establecidas';

      case 'historical':
        if (normalizedScore <= 30) return 'Historial de bajo estrés';
        if (normalizedScore <= 50) return 'Historial de estrés moderado';
        if (normalizedScore <= 70) return 'Historial de alto estrés';
        return 'Historial de estrés crítico';

      default:
        return 'Factor en análisis';
    }
  }

  /**
   * Calcula confianza del modelo basada en datos disponibles 
   */
  calculateConfidence(currentData, historicalData) {
    try {
      let confidence = 0.5; // Base
      
      // Validar currentData
      if (currentData) {
        if (currentData.wellbeing) {
          if (typeof currentData.wellbeing.sleep_hours === 'number' && !isNaN(currentData.wellbeing.sleep_hours)) {
            confidence += 0.2;
          }
          if (typeof currentData.wellbeing.steps === 'number' && !isNaN(currentData.wellbeing.steps)) {
            confidence += 0.15;
          }
        }
        
        if (currentData.mood_entries && Array.isArray(currentData.mood_entries) && currentData.mood_entries.length > 0) {
          confidence += 0.15;
        }
      }
      
      // Datos históricos
      if (historicalData && Array.isArray(historicalData)) {
        if (historicalData.length >= 3) confidence += 0.1;
        if (historicalData.length >= 7) confidence += 0.1;
      }
      
      const finalConfidence = Math.max(0.3, Math.min(0.95, confidence)); // Entre 30% y 95%
      return Math.round(finalConfidence * 100) / 100; // Redondear a 2 decimales
    } catch (error) {
      console.error('Error en calculateConfidence:', error);
      return 0.5; // Confianza por defecto
    }
  }

  /**
   * Predicción por defecto cuando hay errores 
   */
  getDefaultPrediction() {
    return {
      score: 50,
      level: 'medium',
      factors: [{
        factor: 'system_recovery',
        impact: 10,
        description: 'Sistema en recuperación, usando análisis básico'
      }],
      confidence: 0.3,
      model_version: this.modelVersion,
      breakdown: {
        sleep: 50,
        activity: 50,
        mood: 50,
        consistency: 50,
        historical: 50
      },
      generated_at: new Date(),
      note: 'Predicción por defecto debido a error temporal'
    };
  }
}

module.exports = new StressPredictor();
