// emergency-stop-predictions.js
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/harmonia-app';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Conectado a MongoDB');
  } catch (error) {
    console.error('Error conectando a MongoDB:', error);
    process.exit(1);
  }
}

async function emergencyStop() {
  await connectDB();

  const DailyRecord = require('./daily-records-service/models/DailyRecord');

  console.log('PARANDO BUCLES DE PREDICCIÓN...\n');

  // 1. Limpiar alertas excesivas
  const alertCleanup = await DailyRecord.updateMany(
    { 
      'alerts.4': { $exists: true } // Registros con más de 4 alertas
    },
    { 
      $set: { 
        alerts: [] // Limpiar todas las alertas
      } 
    }
  );
  console.log(`Limpiadas alertas de ${alertCleanup.modifiedCount} registros`);

  // 2. Actualizar predicciones recientes para evitar re-ejecución
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const predictionCleanup = await DailyRecord.updateMany(
    { 
      date: { $gte: today },
      'stress_prediction.generated_at': { $exists: true }
    },
    { 
      $set: { 
        'stress_prediction.generated_at': new Date() // Actualizar timestamp
      } 
    }
  );
  console.log(`Actualizadas ${predictionCleanup.modifiedCount} predicciones de hoy`);

  // 3. Encontrar y mostrar registros problemáticos
  const problematicRecords = await DailyRecord.find({
    'alerts.10': { $exists: true } // Registros con más de 10 alertas
  }).limit(10);

  console.log('\nRegistros más problemáticos:');
  problematicRecords.forEach(record => {
    console.log(`   ${record._id}: ${record.alerts?.length || 0} alertas`);
  });

  await mongoose.connection.close();
  console.log('\Operación de emergencia completada!');
  console.log('Reinicia el daily-records-service ahora.');
}

emergencyStop().catch(console.error);
