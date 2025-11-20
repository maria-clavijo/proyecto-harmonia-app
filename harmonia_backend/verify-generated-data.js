require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/harmonia-app';

const USERS = [
  '691b19cbf3001363c9b4da0c',
  '691b1f5ef3001363c9b4eb23'
];

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Conectado a MongoDB');
  } catch (error) {
    console.error('Error conectando a MongoDB:', error);
    process.exit(1);
  }
}

async function verifyGeneratedData() {
  await connectDB();

  const MoodEntry = require('./mood-service/models/MoodEntry');
  const DailyRecord = require('./daily-records-service/models/DailyRecord');

  console.log('Verificando datos generados...\n');

  for (const userId of USERS) {
    console.log(`Usuario: ${userId}`);
    
    // Verificar entradas de ánimo
    const moodCount = await MoodEntry.countDocuments({ user_id: userId });
    console.log(`   Entradas de ánimo: ${moodCount}`);
    
    const recentMoods = await MoodEntry.find({ user_id: userId })
      .sort({ date: -1 })
      .limit(5);
    
    console.log(`   Últimos 5 estados de ánimo:`);
    recentMoods.forEach(mood => {
      console.log(`      ${mood.date.toDateString()}: ${mood.mood_score} - "${mood.note}"`);
    });

    // Verificar registros diarios
    const dailyCount = await DailyRecord.countDocuments({ user_id: userId });
    console.log(`   Registros diarios: ${dailyCount}`);
    
    const recentRecords = await DailyRecord.find({ user_id: userId })
      .sort({ date: -1 })
      .limit(3);
    
    console.log(`   Últimas 3 predicciones de estrés:`);
    recentRecords.forEach(record => {
      if (record.stress_prediction) {
        console.log(`      ${record.date.toDateString()}: ${record.stress_prediction.score} (${record.stress_prediction.level})`);
      }
    });

    // Estadísticas de wellbeing
    const wellbeingStats = await DailyRecord.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          avgSleep: { $avg: '$wellbeing.sleep_hours' },
          avgSteps: { $avg: '$wellbeing.steps' },
          totalRecords: { $sum: 1 }
        }
      }
    ]);

    if (wellbeingStats.length > 0) {
      console.log(`   Sueño promedio: ${wellbeingStats[0].avgSleep?.toFixed(1) || 'N/A'} horas`);
      console.log(`   Pasos promedio: ${Math.round(wellbeingStats[0].avgSteps) || 'N/A'}`);
    }

    console.log('---');
  }

  await mongoose.connection.close();
  console.log('\nVerificación completada');
}

verifyGeneratedData().catch(console.error);
