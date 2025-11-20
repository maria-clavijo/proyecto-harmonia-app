require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

// Configuración de conexión
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/harmonia-app';

// IDs de usuarios
const USERS = [
  '691b19cbf3001363c9b4da0c',
  '691b1f5ef3001363c9b4eb23'  
];

// Configuración de servicios
const SERVICES = {
  mood: process.env.MOOD_SERVICE_PORT || 3002,
  daily: process.env.DAILY_SERVICE_PORT || 3003
};

// Conectar a MongoDB
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Conectado a MongoDB');
  } catch (error) {
    console.error('Error conectando a MongoDB:', error);
    process.exit(1);
  }
}

// Función para generar datos de sueño realistas
function generateSleepData(dayOfWeek, userIndex, date) {
  const baseSleep = {
    weekday: 6.5 + (Math.random() * 1.5), // 6.5-8 horas entre semana
    weekend: 7.5 + (Math.random() * 2.5)  // 7.5-10 horas fin de semana
  };

  const isWeekend = [0, 6].includes(date.getDay()); // 0=domingo, 6=sábado
  let sleepHours = isWeekend ? baseSleep.weekend : baseSleep.weekday;

  // Variaciones por usuario
  if (userIndex === 0) { // Luis - patrones más irregulares
    sleepHours += (Math.random() - 0.5) * 2;
  } else { // Sara - patrones más consistentes
    sleepHours += (Math.random() - 0.3) * 1.5;
  }

  // Eventos especiales que afectan el sueño
  if (Math.random() < 0.1) { // 10% de probabilidad de mal sueño
    sleepHours -= 2 + (Math.random() * 3);
  }

  return Math.max(3, Math.min(12, sleepHours)); // Limitar entre 3-12 horas
}

// Función para generar datos de pasos realistas
function generateStepsData(dayOfWeek, userIndex, date) {
  const baseSteps = {
    weekday: 6000 + (Math.random() * 4000), // 6000-10000 entre semana
    weekend: 4000 + (Math.random() * 6000)  // 4000-10000 fin de semana
  };

  const isWeekend = [0, 6].includes(date.getDay());
  let steps = isWeekend ? baseSteps.weekend : baseSteps.weekday;

  // Perfiles de usuarios
  if (userIndex === 0) { // Luis - más activo
    steps += 2000;
  } else { // Sara - moderadamente activa
    steps += 1000;
  }

  // Días con más/menos actividad
  if (Math.random() < 0.15) { // 15% de días muy activos
    steps += 5000;
  } else if (Math.random() < 0.1) { // 10% de días sedentarios
    steps -= 4000;
  }

  return Math.max(1000, Math.min(25000, steps)); // Limitar entre 1000-25000 pasos
}

// Función para generar estados de ánimo realistas
function generateMoodScore(date, userIndex, previousMood) {
  let baseMood = 50 + (Math.random() * 40); // Base 50-90

  // Patrones semanales
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) { // Fin de semana - mejor ánimo
    baseMood += 10;
  } else if (dayOfWeek === 1) { // Lunes - peor ánimo
    baseMood -= 5;
  }

  // Perfiles de usuarios
  if (userIndex === 0) { // Luis - ánimo más variable
    baseMood += (Math.random() - 0.5) * 30;
  } else { // Sara - ánimo más estable
    baseMood += (Math.random() - 0.5) * 15;
  }

  // Inercia del ánimo del día anterior
  if (previousMood) {
    baseMood = (baseMood + previousMood) / 2;
  }

  // Eventos especiales
  if (Math.random() < 0.05) { // 5% de días excepcionalmente buenos
    baseMood += 20;
  } else if (Math.random() < 0.07) { // 7% de días malos
    baseMood -= 25;
  }

  return Math.max(10, Math.min(100, Math.round(baseMood)));
}

// Función para generar notas de ánimo realistas
function generateMoodNote(moodScore, date) {
  const moods = {
    high: [
      "Me siento increíble hoy, lleno de energía",
      "Gran día, todo fluye perfectamente",
      "Muy positivo y motivado",
      "Contento con mis progresos",
      "Día productivo y satisfactorio"
    ],
    medium: [
      "Día normal, sin mayores complicaciones",
      "Me siento equilibrado y tranquilo",
      "Bien en general, algunas preocupaciones menores",
      "Día rutinario pero agradable",
      "Estable emocionalmente"
    ],
    low: [
      "Hoy me cuesta encontrar motivación",
      "Algo estresado con el trabajo",
      "No dormí bien, me siento cansado",
      "Preocupado por algunos temas personales",
      "Día complicado, necesito descansar"
    ]
  };

  let moodCategory;
  if (moodScore >= 70) moodCategory = 'high';
  else if (moodScore >= 40) moodCategory = 'medium';
  else moodCategory = 'low';

  const notes = moods[moodCategory];
  return notes[Math.floor(Math.random() * notes.length)];
}

// Función para generar etiquetas de ánimo
function generateMoodTags(moodScore) {
  const baseTags = [];
  
  if (moodScore >= 70) {
    baseTags.push('feliz', 'energético', 'motivado');
  } else if (moodScore >= 40) {
    baseTags.push('estable', 'tranquilo', 'equilibrado');
  } else {
    baseTags.push('cansado', 'preocupado', 'estresado');
  }

  // Añadir etiquetas adicionales ocasionales
  if (Math.random() < 0.3) {
    const extraTags = ['trabajo', 'familia', 'ejercicio', 'descanso', 'social'];
    baseTags.push(extraTags[Math.floor(Math.random() * extraTags.length)]);
  }

  return baseTags;
}

// Función para crear entrada de ánimo
async function createMoodEntry(userId, date, moodScore, note, tags) {
  try {
    await axios.post(`http://localhost:${SERVICES.mood}/mood`, {
      mood_score: moodScore,
      note: note,
      tags: tags,
      date: date
    }, {
      headers: { 'x-user-id': userId }
    });
    return true;
  } catch (error) {
    console.error(`Error creando mood entry para usuario ${userId}:`, error.message);
    return false;
  }
}

// Función para sincronizar datos de bienestar
async function syncWellbeingData(userId, date, sleepHours, steps) {
  try {
    await axios.post(`http://localhost:${SERVICES.daily}/daily/wellbeing/sync`, {
      sleep_hours: sleepHours,
      steps: steps,
      source: 'simulation',
      date: date
    }, {
      headers: { 'x-user-id': userId }
    });
    return true;
  } catch (error) {
    console.error(`Error sincronizando wellbeing para usuario ${userId}:`, error.message);
    return false;
  }
}

// Función para generar predicción de estrés
async function generateStressPrediction(userId, date) {
  try {
    await axios.post(`http://localhost:${SERVICES.daily}/daily/stress/predict`, {
      force_refresh: true
    }, {
      headers: { 'x-user-id': userId }
    });
    return true;
  } catch (error) {
    console.error(`Error generando predicción para usuario ${userId}:`, error.message);
    return false;
  }
}

// Función principal para generar datos históricos
async function generateHistoricalData() {
  await connectDB();

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 2); // 2 meses atrás
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);

  console.log(`Generando datos desde ${startDate.toDateString()} hasta ${endDate.toDateString()}`);

  for (let userIndex = 0; userIndex < USERS.length; userIndex++) {
    const userId = USERS[userIndex];
    const userName = userIndex === 0 ? 'Luis' : 'Sara';
    
    console.log(`\nGenerando datos para ${userName} (${userId})`);
    
    let previousMood = null;
    let currentDate = new Date(startDate);
    let daysProcessed = 0;
    let successfulDays = 0;

    while (currentDate <= endDate) {
      try {
        // Generar datos para el día actual
        const sleepHours = generateSleepData(currentDate.getDay(), userIndex, currentDate);
        const steps = generateStepsData(currentDate.getDay(), userIndex, currentDate);
        const moodScore = generateMoodScore(currentDate, userIndex, previousMood);
        const moodNote = generateMoodNote(moodScore, currentDate);
        const moodTags = generateMoodTags(moodScore);

        // Crear entrada de ánimo
        const moodSuccess = await createMoodEntry(userId, currentDate, moodScore, moodNote, moodTags);
        
        // Sincronizar datos de bienestar
        const wellbeingSuccess = await syncWellbeingData(userId, currentDate, sleepHours, steps);

        if (moodSuccess && wellbeingSuccess) {
          // Generar predicción de estrés (con retraso para procesar datos)
          await new Promise(resolve => setTimeout(resolve, 100));
          await generateStressPrediction(userId, currentDate);
          
          successfulDays++;
          previousMood = moodScore;
        }

        daysProcessed++;
        
        // Mostrar progreso cada 10 días
        if (daysProcessed % 10 === 0) {
          console.log(`   Procesados ${daysProcessed} días...`);
        }

        // Esperar entre días para no sobrecargar los servicios
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        console.error(`Error procesando día ${currentDate.toDateString()}:`, error.message);
      }

      // Siguiente día
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(12, 0, 0, 0); // Hora del medio día para consistencia
    }

    console.log(`${userName}: ${successfulDays}/${daysProcessed} días procesados exitosamente`);
  }

  console.log('\nGeneración de datos históricos completada!');
  console.log('Ahora puedes ver:');
  console.log('   - Resúmenes semanales en /daily/summary/weekly');
  console.log('   - Predicciones de estrés en /daily/stress/predict');
  console.log('   - Historial de ánimo en /mood');
  console.log('   - Insights en /daily/insights');
  
  process.exit(0);
}

// Manejo de errores global
process.on('unhandledRejection', (error) => {
  console.error('Error no manejado:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Excepción no capturada:', error);
  process.exit(1);
});

// Ejecutar el script
generateHistoricalData().catch(console.error);
