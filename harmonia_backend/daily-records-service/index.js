require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cron = require('node-cron');
const connectDB = require('../shared/database');
const DailyRecord = require('./models/DailyRecord');
const User = require('../user-service/models/User');
const Exercise = require('../exercises-service/models/Exercise');
const StressPredictor = require('./stressPredictor');
const RecommendationEngine = require('./recommendationEngine');

const app = express();
const PORT = process.env.DAILY_SERVICE_PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to database
connectDB();

// =============================================================================
// MIDDLEWARES
// =============================================================================

/**
 * Authentication Middleware
 */
const auth = async (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ message: 'User ID required' });
  }
  req.userId = userId;
  next();
};

// =============================================================================
// CONSTANTS & CONFIGURATION
// =============================================================================

/**
 * Notification Types Configuration
 */
const NOTIFICATION_TYPES = {
  MORNING_CHECKIN: {
    title: '☀️ Buenos días',
    body: '¿Cómo te sientes hoy? Cuéntame sobre tu estado de ánimo.',
    actions: ['Bien 😊', 'Regular 😐', 'Mal 😔'],
    trigger_hour: 9
  },
  AFTERNOON_FOLLOWUP: {
    title: '📝 Check-in de la tarde',
    body: '¿Cómo ha ido tu día? ¿Ha pasado algo que quieras compartir?',
    actions: ['Día tranquilo', 'Algo estresante', 'Momento especial'],
    trigger_hour: 17
  },
  EVENING_REFLECTION: {
    title: '🌙 Hora de reflexionar',
    body: 'Antes de que termine el día, ¿cómo calificarías tu estado emocional?',
    actions: ['1-3 😞', '4-7 😐', '8-10 😊'],
    trigger_hour: 21
  },
  EXERCISE_REMINDER: {
    title: '🧘‍♀️ Momento para ti',
    body: '¿Te gustaría hacer un ejercicio de relajación? Solo 5 minutos.',
    actions: ['Sí, vamos!', 'Ahora no', 'Recordrámelo más tarde'],
    trigger_hour: 14
  }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get start and end of day for a given date
 */
function getDayRange(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
}

/**
 * Find or create daily record for a user and date
 */
async function findOrCreateDailyRecord(userId, date = new Date()) {
  const { start, end } = getDayRange(date);
  
  let dailyRecord = await DailyRecord.findOne({
    user_id: userId,
    date: { $gte: start, $lt: end }
  });
  
  if (!dailyRecord) {
    dailyRecord = new DailyRecord({
      user_id: userId,
      date: start
    });
  }
  
  return dailyRecord;
}

/**
 * Map user response to mood score
 */
function mapResponseToMoodScore(action, responseText) {
  const responseMap = {
    'Bien 😊': 80,
    'Regular 😐': 50,
    'Mal 😔': 20,
    '1-3 😞': 25,
    '4-7 😐': 50,
    '8-10 😊': 85,
    'Día tranquilo': 70,
    'Algo estresante': 40,
    'Momento especial': 90,
    'Sí, vamos!': 60,
    'Ahora no': 40
  };

  return responseMap[action] || 50;
}

/**
 * Create mood entry from notification response
 */
async function createMoodEntryFromResponse(userId, action, responseText, notificationType) {
  try {
    const moodScore = mapResponseToMoodScore(action, responseText);
    
    await axios.post(
      `http://localhost:${process.env.MOOD_SERVICE_PORT || 3002}/mood`,
      {
        mood_score: moodScore,
        note: responseText || `Respuesta automática: ${action}`,
        tags: ['notificación', notificationType.toLowerCase().replace('_', '-')],
        date: new Date()
      },
      {
        headers: {
          'x-user-id': userId
        }
      }
    );
    
    return moodScore;
  } catch (moodError) {
    console.error('Error creating mood entry from notification:', moodError);
    throw moodError;
  }
}

// =============================================================================
// NOTIFICATION SYSTEM
// =============================================================================

/**
 * Schedule notifications cron job
 */
cron.schedule(process.env.NOTIFICATION_CRON_SCHEDULE || '0 9,14,17,21 * * *', async () => {
  try {
    console.log('Scheduling notifications...');
    
    const users = await User.find({
      'settings.notifications_enabled': true
    });

    const now = new Date();
    const currentHour = now.getHours();

    for (const user of users) {
      try {
        await scheduleNotificationForUser(user, currentHour, now);
      } catch (userError) {
        console.error(`Error scheduling notification for user ${user._id}:`, userError);
      }
    }
  } catch (error) {
    console.error('Error in notification scheduling:', error);
  }
});

/**
 * Schedule notification for a specific user
 */
async function scheduleNotificationForUser(user, currentHour, now) {
  // Check if user already has a notification today
  const { start, end } = getDayRange(now);
  const todayRecord = await DailyRecord.findOne({
    user_id: user._id,
    date: { $gte: start, $lt: end }
  });

  if (todayRecord?.alert) {
    return; // Skip if already has notification today
  }

  // Select notification type based on hour and preferences
  const notificationType = getNotificationTypeForHour(currentHour, user);
  if (!notificationType) return;

  const notificationConfig = NOTIFICATION_TYPES[notificationType];
  
  // Register in daily record
  let dailyRecord = await findOrCreateDailyRecord(user._id, now);
  
  dailyRecord.alert = {
    type: notificationType,
    delivered_at: new Date(),
    clicked: false,
    completed_action: false
  };

  await dailyRecord.save();
  console.log(`Notification scheduled for user ${user._id}: ${notificationType}`);
}

/**
 * Get appropriate notification type for current hour and user preferences
 */
function getNotificationTypeForHour(currentHour, user) {
  if (currentHour === 9 && user.settings.notification_preferences?.morning_checkin !== false) {
    return 'MORNING_CHECKIN';
  } else if (currentHour === 14 && user.settings.notification_preferences?.exercise_reminders !== false) {
    return 'EXERCISE_REMINDER';
  } else if (currentHour === 17 && user.settings.notification_preferences?.afternoon_followup !== false) {
    return 'AFTERNOON_FOLLOWUP';
  } else if (currentHour === 21 && user.settings.notification_preferences?.evening_reflection !== false) {
    return 'EVENING_REFLECTION';
  }
  return null;
}

// =============================================================================
// NOTIFICATION ROUTES
// =============================================================================

/**
 * Get pending notifications for current user
 */
app.get('/daily/notifications/pending', auth, async (req, res) => {
  try {
    const { start, end } = getDayRange();
    
    const dailyRecord = await DailyRecord.findOne({
      user_id: req.userId,
      date: { $gte: start, $lt: end }
    });

    if (!dailyRecord || !dailyRecord.alert || dailyRecord.alert.clicked) {
      return res.json({ hasNotification: false });
    }

    const notificationConfig = NOTIFICATION_TYPES[dailyRecord.alert.type];
    
    res.json({
      hasNotification: true,
      notification: {
        type: dailyRecord.alert.type,
        title: notificationConfig.title,
        body: notificationConfig.body,
        actions: notificationConfig.actions,
        alertId: dailyRecord._id
      }
    });
  } catch (error) {
    console.error('Error getting pending notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Handle notification response
 */
app.post('/daily/notifications/handle-response', auth, async (req, res) => {
  try {
    const { alertId, action, responseText } = req.body;

    const dailyRecord = await DailyRecord.findOne({
      _id: alertId,
      user_id: req.userId
    });

    if (!dailyRecord || !dailyRecord.alert) {
      return res.status(404).json({ message: 'No active notification found' });
    }

    // Update notification status
    dailyRecord.alert.clicked = true;
    dailyRecord.alert.completed_action = true;
    dailyRecord.alert.user_response = action;
    dailyRecord.alert.response_text = responseText;
    dailyRecord.alert.responded_at = new Date();

    await dailyRecord.save();

    // Create mood entry for mood-related notifications
    if (['MORNING_CHECKIN', 'EVENING_REFLECTION'].includes(dailyRecord.alert.type)) {
      try {
        await createMoodEntryFromResponse(
          req.userId, 
          action, 
          responseText, 
          dailyRecord.alert.type
        );
      } catch (moodError) {
        console.error('Error creating mood entry:', moodError);
      }
    }

    res.json({ 
      message: 'Response recorded successfully',
      action: action,
      response: responseText
    });

  } catch (error) {
    console.error('Error handling notification response:', error);
    res.status(500).json({ message: 'Failed to handle response' });
  }
});

// =============================================================================
// WELLBEING ROUTES
// =============================================================================


/**
 * Sync wellbeing data (Google Fit, etc.) 
 */

// Endpoint de sync wellbeing - EVITAR AUTO-PREDICTION
app.post('/daily/wellbeing/sync', auth, async (req, res) => {
  try {
    const { sleep_hours, steps, source, date, skip_auto_prediction = false } = req.body; 
    const syncDate = date ? new Date(date) : new Date();
    
    console.log(`Received wellbeing sync:`, { 
      userId: req.userId, 
      sleep_hours, 
      steps, 
      source,
      date: syncDate,
      skip_auto_prediction 
    });
    
    const dailyRecord = await findOrCreateDailyRecord(req.userId, syncDate);
    
    // Actualizar wellbeing data
    dailyRecord.wellbeing = {
      sleep_hours: sleep_hours || dailyRecord.wellbeing?.sleep_hours || 0,
      steps: steps || dailyRecord.wellbeing?.steps || 0,
      source: source || 'google_fit',
      last_sync_at: new Date()
    };
    
    await dailyRecord.save();
    
    console.log('Wellbeing data saved successfully for user:', req.userId);
    
    // EVITAR AUTO-PREDICTION EN BUCLES 
    if (!skip_auto_prediction) {
      // Disparar predicción con retraso y solo si es necesario
      setTimeout(async () => {
        try {
          const todayRecord = await findOrCreateDailyRecord(req.userId);
          const predictionAge = todayRecord.stress_prediction ? 
            Date.now() - new Date(todayRecord.stress_prediction.generated_at).getTime() : 
            Infinity;
          
          // Solo predecir si no hay predicción reciente (>30 minutos)
          if (predictionAge > 30 * 60 * 1000) {
            console.log('Triggering auto-prediction after sync');
            await axios.post(
              `http://localhost:${PORT}/daily/stress/predict`,
              { force_refresh: true },
              { 
                headers: { 'x-user-id': req.userId },
                timeout: 5000 // Timeout corto
              }
            );
          }
        } catch (predError) {
          console.log('Auto-prediction skipped or failed:', predError.message);
        
        }
      }, 2000); // Retraso de 2 segundos
    }
    
    res.status(201).json({
      message: 'Wellbeing data synced successfully',
      record: {
        _id: dailyRecord._id,
        date: dailyRecord.date,
        wellbeing: dailyRecord.wellbeing
      }
    });
  } catch (error) {
    console.error('Wellbeing sync error:', error);
    res.status(500).json({ 
      message: 'Server error during wellbeing sync',
      error: error.message 
    });
  }
});


/**
 * Get today's wellbeing data
 */
app.get('/daily/wellbeing/today', auth, async (req, res) => {
  try {
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    res.json({
      wellbeing: dailyRecord.wellbeing || {},
      has_data: !!(dailyRecord.wellbeing && 
                   (dailyRecord.wellbeing.sleep_hours !== undefined || 
                    dailyRecord.wellbeing.steps !== undefined))
    });
  } catch (error) {
    console.error('Get today wellbeing error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


/**
 * Manual wellbeing data entry
 */
app.post('/daily/wellbeing', auth, async (req, res) => {
  try {
    const { sleep_hours, steps, source } = req.body;
    
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    dailyRecord.wellbeing = {
      sleep_hours,
      steps,
      source: source || 'manual'
    };
    
    await dailyRecord.save();
    
    res.status(201).json({
      message: 'Wellbeing data saved successfully',
      record: dailyRecord
    });
  } catch (error) {
    console.error('Wellbeing save error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get wellbeing records
 */
app.get('/daily/wellbeing', auth, async (req, res) => {
  try {
    const { from, to } = req.query;
    let query = { user_id: req.userId };
    
    // Date range filter
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    
    const records = await DailyRecord.find(query)
      .sort({ date: -1 })
      .limit(30);
    
    res.json({ records });
  } catch (error) {
    console.error('Get wellbeing error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =============================================================================
// PREDICTION ROUTES
// =============================================================================

/**
 * Save prediction data
 */
app.post('/daily/predict', auth, async (req, res) => {
  try {
    const { score, bucket, why_text, model_version } = req.body;
    
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    // Update prediction
    dailyRecord.prediction = {
      score,
      bucket,
      why_text,
      model_version: model_version || '1.0'
    };
    
    await dailyRecord.save();
    
    res.status(201).json({
      message: 'Prediction saved successfully',
      record: dailyRecord
    });
  } catch (error) {
    console.error('Prediction save error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get today's prediction
 */
app.get('/daily/predict/today', auth, async (req, res) => {
  try {
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    if (!dailyRecord.prediction) {
      return res.status(404).json({ message: 'No prediction for today' });
    }
    
    res.json({ prediction: dailyRecord.prediction });
  } catch (error) {
    console.error('Get prediction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =============================================================================
// ALERT ROUTES
// =============================================================================

/**
 * Dispatch manual alert
 */
app.post('/daily/alerts/dispatch', auth, async (req, res) => {
  try {
    const { type } = req.body;
    
    const { start, end } = getDayRange();
    
    // Check if alert already exists today
    const existingAlert = await DailyRecord.findOne({
      user_id: req.userId,
      date: { $gte: start, $lt: end },
      'alert.delivered_at': { $gte: start }
    });
    
    if (existingAlert) {
      return res.status(400).json({ message: 'Alert already dispatched today' });
    }
    
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    // Create alert
    dailyRecord.alert = {
      type: type || 'stress_alert',
      delivered_at: new Date()
    };
    
    await dailyRecord.save();
    
    res.status(201).json({
      message: 'Alert dispatched successfully',
      alert: dailyRecord.alert
    });
  } catch (error) {
    console.error('Alert dispatch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get today's alert
 */
app.get('/daily/alerts/today', auth, async (req, res) => {
  try {
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    if (!dailyRecord.alert) {
      return res.status(404).json({ message: 'No alerts for today' });
    }
    
    res.json({ alert: dailyRecord.alert });
  } catch (error) {
    console.error('Get alert error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Update alert status 
 */
app.patch('/daily/alerts/:id', auth, async (req, res) => {
  try {
    const { clicked, completed_action } = req.body;
    
    const dailyRecord = await DailyRecord.findOne({
      _id: req.params.id,
      user_id: req.userId
    });
    
    if (!dailyRecord) {
      return res.status(404).json({ message: 'Alert not found' });
    }
    
    // Update alert 
    dailyRecord.alert = dailyRecord.alert || {};
    if (clicked !== undefined) dailyRecord.alert.clicked = clicked;
    if (completed_action !== undefined) dailyRecord.alert.completed_action = completed_action;
    
    await dailyRecord.save();
    
    res.json({
      message: 'Alert updated successfully',
      alert: dailyRecord.alert
    });
  } catch (error) {
    console.error('Alert update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =============================================================================
// EXERCISE SESSION ROUTES
// =============================================================================

/**
 * Record exercise session
 */
app.post('/daily/sessions', auth, async (req, res) => {
  try {
    const { exercise_id, started_at, completed_at } = req.body;
    
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    // Add session 
    dailyRecord.sessions = dailyRecord.sessions || [];
    dailyRecord.sessions.push({
      exercise_id,
      started_at: started_at || new Date(),
      completed_at: completed_at || new Date()
    });
    
    await dailyRecord.save();
    
    res.status(201).json({
      message: 'Exercise session recorded successfully',
      record: dailyRecord
    });
  } catch (error) {
    console.error('Session save error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get exercise sessions
 */
app.get('/daily/sessions', auth, async (req, res) => {
  try {
    const { from, to } = req.query;
    let query = { user_id: req.userId };
    
    // Date range filter
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    
    const records = await DailyRecord.find(query)
      .select('date sessions')
      .populate('sessions.exercise_id', 'title category duration_seconds')
      .sort({ date: -1 })
      .limit(30);
    
    // Extract and flatten sessions
    const sessions = records.flatMap(record => 
      record.sessions.map(session => ({
        ...session.toObject(),
        date: record.date
      }))
    );
    
    res.json({ sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =============================================================================
// ANALYTICS & INSIGHTS ROUTES
// =============================================================================


/**
 * Get weekly summary 
 */
app.get('/daily/summary/weekly', auth, async (req, res) => {
  try {
    const { week_start } = req.query;
    
    // Calcular fecha de inicio de semana (lunes)
    const startDate = week_start ? new Date(week_start) : new Date();
    startDate.setDate(startDate.getDate() - startDate.getDay() + 1); // Ir al lunes
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6); // Hasta domingo
    endDate.setHours(23, 59, 59, 999);

    console.log(`Buscando registros semanales: ${startDate.toISOString()} a ${endDate.toISOString()}`);

    // Obtener registros de la semana
    const records = await DailyRecord.find({
      user_id: req.userId,
      date: { $gte: startDate, $lte: endDate }
    })
    .populate('sessions.exercise_id')
    .sort({ date: 1 });

    console.log(`Encontrados ${records.length} registros para la semana`);

    // Calcular estadísticas semanales
    const summary = calculateWeeklySummary(records);
    
    res.json({
      success: true,
      week_start: startDate,
      week_end: endDate,
      summary: summary,
      records: records.map(record => ({
        date: record.date,
        stress_score: record.stress_prediction?.score || null,
        stress_level: record.stress_prediction?.level || 'unknown',
        sleep_hours: record.wellbeing?.sleep_hours || null,
        steps: record.wellbeing?.steps || null,
        exercise_sessions: record.sessions?.length || 0,
        mood_entries: record.mood_entries?.length || 0
      }))
    });

  } catch (error) {
    console.error('Error en weekly summary:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error al generar el resumen semanal',
      error: error.message 
    });
  }
});

/**
 * Calcular resumen semanal 
 */
function calculateWeeklySummary(records) {
  const summary = {
    total_days: records.length,
    average_stress: 0,
    average_sleep: 0,
    average_steps: 0,
    total_exercise_sessions: 0,
    total_mood_entries: 0,
    days_with_data: 0
  };

  let totalStress = 0;
  let totalSleep = 0;
  let totalSteps = 0;
  let stressDays = 0;
  let sleepDays = 0;
  let stepsDays = 0;

  records.forEach(record => {
    // Contar días con datos
    if (record.stress_prediction || record.wellbeing || record.mood_entries?.length > 0 || record.sessions?.length > 0) {
      summary.days_with_data++;
    }

    // Calcular estrés promedio
    if (record.stress_prediction?.score) {
      totalStress += record.stress_prediction.score;
      stressDays++;
    }

    // Calcular sueño promedio
    if (record.wellbeing?.sleep_hours) {
      totalSleep += record.wellbeing.sleep_hours;
      sleepDays++;
    }

    // Calcular pasos promedio
    if (record.wellbeing?.steps) {
      totalSteps += record.wellbeing.steps;
      stepsDays++;
    }

    // Contar ejercicios y mood entries
    summary.total_exercise_sessions += record.sessions?.length || 0;
    summary.total_mood_entries += record.mood_entries?.length || 0;
  });

  // Calcular promedios
  summary.average_stress = stressDays > 0 ? Math.round(totalStress / stressDays) : 0;
  summary.average_sleep = sleepDays > 0 ? parseFloat((totalSleep / sleepDays).toFixed(1)) : 0;
  summary.average_steps = stepsDays > 0 ? Math.round(totalSteps / stepsDays) : 0;

  // Determinar tendencia
  summary.stress_trend = calculateWeeklyTrend(records, 'stress');
  summary.sleep_trend = calculateWeeklyTrend(records, 'sleep');
  summary.activity_trend = calculateWeeklyTrend(records, 'activity');

  return summary;
}

/**
 * Calcular tendencia semanal 
 */
function calculateWeeklyTrend(records, metric) {
  if (records.length < 3) return 'stable';
  
  const firstHalf = records.slice(0, Math.ceil(records.length / 2));
  const secondHalf = records.slice(Math.ceil(records.length / 2));
  
  let firstAvg, secondAvg;
  
  switch(metric) {
    case 'stress':
      firstAvg = calculateAverage(firstHalf, 'stress_prediction.score');
      secondAvg = calculateAverage(secondHalf, 'stress_prediction.score');
      break;
    case 'sleep':
      firstAvg = calculateAverage(firstHalf, 'wellbeing.sleep_hours');
      secondAvg = calculateAverage(secondHalf, 'wellbeing.sleep_hours');
      break;
    case 'activity':
      firstAvg = calculateAverage(firstHalf, 'wellbeing.steps');
      secondAvg = calculateAverage(secondHalf, 'wellbeing.steps');
      break;
    default:
      return 'stable';
  }
  
  if (firstAvg === 0 || secondAvg === 0) return 'stable';
  
  const difference = secondAvg - firstAvg;
  const threshold = metric === 'stress' ? 5 : metric === 'sleep' ? 0.5 : 1000;
  
  if (difference > threshold) return 'improving';
  if (difference < -threshold) return 'declining';
  return 'stable';
}

/**
 * Calcular promedio de un campo 
 */
function calculateAverage(records, fieldPath) {
  const values = records.map(record => {
    const value = fieldPath.split('.').reduce((obj, key) => obj?.[key], record);
    return value && !isNaN(value) ? Number(value) : null;
  }).filter(val => val !== null);
  
  return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
}



/**
 * Get insights and analytics
 */
app.get('/daily/insights', auth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const records = await DailyRecord.find({
      user_id: req.userId,
      date: { $gte: startDate }
    }).sort({ date: 1 });

    const insights = calculateInsights(records);
    
    res.json({ insights, records: records.length });
  } catch (error) {
    console.error('Insights error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Calculate insights from records
 */
function calculateInsights(records) {
  const insights = {
    totalDays: records.length,
    averageMood: 0,
    averageSleep: 0,
    averageSteps: 0,
    exerciseFrequency: 0,
    moodTrend: 'stable',
    correlations: []
  };

  let totalMood = 0;
  let totalSleep = 0;
  let totalSteps = 0;
  let totalExercises = 0;
  let moodCount = 0;
  let sleepCount = 0;
  let stepsCount = 0;

  records.forEach(record => {
    if (record.prediction?.score) {
      totalMood += record.prediction.score;
      moodCount++;
    }
    if (record.wellbeing?.sleep_hours) {
      totalSleep += record.wellbeing.sleep_hours;
      sleepCount++;
    }
    if (record.wellbeing?.steps) {
      totalSteps += record.wellbeing.steps;
      stepsCount++;
    }
    if (record.sessions) {
      totalExercises += record.sessions.length;
    }
  });

  // Calculate averages
  insights.averageMood = moodCount > 0 ? Math.round(totalMood / moodCount) : 0;
  insights.averageSleep = sleepCount > 0 ? Math.round((totalSleep / sleepCount) * 10) / 10 : 0;
  insights.averageSteps = stepsCount > 0 ? Math.round(totalSteps / stepsCount) : 0;
  insights.exerciseFrequency = records.length > 0 ? (totalExercises / records.length) : 0;

  // Calculate mood trend
  insights.moodTrend = calculateMoodTrend(records);

  return insights;
}

/**
 * Calculate mood trend from records
 */
function calculateMoodTrend(records) {
  if (records.length < 7) return 'stable';
  
  const recentMood = records.slice(-7).reduce((sum, record) => 
    sum + (record.prediction?.score || 50), 0) / 7;
  
  const previousMood = records.slice(-14, -7).reduce((sum, record) => 
    sum + (record.prediction?.score || 50), 0) / 7;
  
  return recentMood > previousMood + 5 ? 'improving' : 
         recentMood < previousMood - 5 ? 'declining' : 'stable';
}


// =============================================================================
// STRESS PREDICTION ROUTES
// =============================================================================

/**
 * Generate stress prediction for today
 */

// En daily-records-service/index.js 

app.post('/daily/stress/predict', auth, async (req, res) => {
  try {
    const { force_refresh = false } = req.body;
    
    console.log(`Starting stress prediction for user: ${req.userId}`);
    
    // Obtener registro de hoy con manejo de errores
    let dailyRecord;
    try {
      dailyRecord = await findOrCreateDailyRecord(req.userId);
    } catch (recordError) {
      console.error('Error finding/creating daily record:', recordError);
      return res.status(500).json({ message: 'Error accessing daily records' });
    }
    
    // Verificar si ya existe una predicción reciente
    if (!force_refresh && dailyRecord.stress_prediction) {
      const predictionAge = Date.now() - new Date(dailyRecord.stress_prediction.generated_at).getTime();
      const maxAge = 6 * 60 * 60 * 1000;
      
      if (predictionAge < maxAge) {
        return res.json({
          message: 'Using cached prediction',
          prediction: dailyRecord.stress_prediction,
          recommendations: dailyRecord.recommendations || []
        });
      }
    }
    
    // Obtener datos históricos con manejo de errores
    let historicalData = [];
    try {
      historicalData = await DailyRecord.find({
        user_id: req.userId,
        date: { 
          $lt: dailyRecord.date,
          $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        }
      }).sort({ date: -1 });
    } catch (historyError) {
      console.error('Error fetching historical data:', historyError);
      historicalData = []; // Continuar con array vacío
    }
    
    console.log(`Historical data found: ${historicalData.length} records`);
    
    let stressPrediction;
    let recommendations = [];
    
    try {
      // Generar predicción
      stressPrediction = await StressPredictor.predictStress(
        req.userId,
        dailyRecord,
        historicalData
      );
      
      console.log(`Prediction generated: ${stressPrediction.score} (${stressPrediction.level})`);
      
      // Generar recomendaciones
      recommendations = await RecommendationEngine.generateRecommendations(
        req.userId,
        stressPrediction,
        historicalData
      );
      
      console.log(`Recommendations generated: ${recommendations.length}`);
      
    } catch (predictionError) {
      console.error('Error in prediction process:', predictionError);
      
      // Usar predicción por defecto
      stressPrediction = StressPredictor.getDefaultPrediction();
      recommendations = RecommendationEngine.getFallbackRecommendations('medium');
      
      console.log('Using fallback prediction due to error');
    }
    
    // Actualizar registro
    try {
      dailyRecord.stress_prediction = stressPrediction;
      dailyRecord.recommendations = recommendations;
      await dailyRecord.save();
    } catch (saveError) {
      console.error('Error saving prediction:', saveError);
      // Continuar aunque falle el guardado
    }
    
    // Verificar si se necesita alerta 
    try {
      await checkAndCreateAlerts(req.userId, dailyRecord, stressPrediction);
    } catch (alertError) {
      console.error('Error creating alerts:', alertError);
    }
    
    res.json({
      message: 'Stress prediction generated successfully',
      prediction: stressPrediction,
      recommendations: recommendations
    });
    
  } catch (error) {
    console.error('Overall stress prediction error:', error);
    
    // Último recurso: predicción por defecto
    const defaultPrediction = StressPredictor.getDefaultPrediction();
    const defaultRecommendations = RecommendationEngine.getFallbackRecommendations('medium');
    
    res.json({
      message: 'Prediction generated with limitations',
      prediction: defaultPrediction,
      recommendations: defaultRecommendations,
      warning: 'Using fallback prediction due to server error'
    });
  }
});



/**
 * Get today's stress prediction
 */
app.get('/daily/stress/today', auth, async (req, res) => {
  try {
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    if (!dailyRecord.stress_prediction) {
      return res.status(404).json({ message: 'No stress prediction for today' });
    }
    
    res.json({
      prediction: dailyRecord.stress_prediction,
      recommendations: dailyRecord.recommendations || []
    });
  } catch (error) {
    console.error('Get stress prediction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get stress history
 */
app.get('/daily/stress/history', auth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const records = await DailyRecord.find({
      user_id: req.userId,
      date: { $gte: startDate },
      'stress_prediction.score': { $exists: true }
    })
    .select('date stress_prediction wellbeing')
    .sort({ date: -1 });
    
    const history = records.map(record => ({
      date: record.date,
      stress_score: record.stress_prediction.score,
      stress_level: record.stress_prediction.level,
      sleep_hours: record.wellbeing?.sleep_hours,
      steps: record.wellbeing?.steps
    }));
    
    // Calcular estadísticas
    const stats = calculateStressStats(records);
    
    res.json({ history, stats });
  } catch (error) {
    console.error('Get stress history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =============================================================================
// RECOMMENDATION ROUTES
// =============================================================================

/**
 * Mark recommendation as completed
 */
app.patch('/daily/recommendations/:recId/complete', auth, async (req, res) => {
  try {
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    const recommendation = dailyRecord.recommendations.id(req.params.recId);
    if (!recommendation) {
      return res.status(404).json({ message: 'Recommendation not found' });
    }
    
    recommendation.completed = true;
    recommendation.completed_at = new Date();
    await dailyRecord.save();
    
    res.json({ 
      message: 'Recommendation marked as completed',
      recommendation 
    });
  } catch (error) {
    console.error('Complete recommendation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get active recommendations
 */
app.get('/daily/recommendations/active', auth, async (req, res) => {
  try {
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    const activeRecommendations = (dailyRecord.recommendations || [])
      .filter(rec => !rec.completed)
      .sort((a, b) => b.priority - a.priority);
    
    res.json({ recommendations: activeRecommendations });
  } catch (error) {
    console.error('Get active recommendations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =============================================================================
// ALERT SYSTEM
// =============================================================================

/**
 * Check and create alerts based on stress prediction
 */

// Función checkAndCreateAlerts para evitar race conditions
async function checkAndCreateAlerts(userId, dailyRecord, stressPrediction) {
  try {
    // OBTENER SIEMPRE LA VERSIÓN MÁS RECIENTE 
    const freshRecord = await DailyRecord.findById(dailyRecord._id);
    if (!freshRecord) {
      console.log('⚠️ Record not found for alerts, skipping');
      return;
    }

    const alerts = [];
    
    // Solo crear alertas para niveles realmente altos
    if (stressPrediction.level === 'critical') {
      alerts.push({
        type: 'stress_alert',
        title: '🚨 Nivel de Estrés Crítico',
        message: 'Hemos detectado niveles muy altos de estrés. Te recomendamos practicar ejercicios de relajación.',
        stress_level: 'critical',
        delivered_at: new Date()
      });
    }
    
    // Alerta por estrés alto persistente (solo si hay historial)
    else if (stressPrediction.level === 'high') {
      const recentRecords = await DailyRecord.find({
        user_id: userId,
        date: { 
          $lt: freshRecord.date,
          $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        },
        'stress_prediction.level': 'high'
      }).limit(5); // Limitar búsqueda

      if (recentRecords.length >= 2) {
        alerts.push({
          type: 'stress_alert',
          title: '⚠️ Estrés Elevado Persistente',
          message: 'Has tenido varios días con estrés elevado. Considera ajustar tu rutina.',
          stress_level: 'high',
          delivered_at: new Date()
        });
      }
    }
    
    // SOLO añadir alertas si no hay demasiadas ya
    if (alerts.length > 0 && (!freshRecord.alerts || freshRecord.alerts.length < 5)) {
      freshRecord.alerts = [...(freshRecord.alerts || []), ...alerts];
      
      // GUARDADO SEGURO con reintentos
      try {
        await freshRecord.save();
        console.log(`Created ${alerts.length} alerts for user ${userId}`);
      } catch (saveError) {
        console.log('Alert save conflict, skipping:', saveError.message);
        // No reintentar - evitar bucles
      }
    }
    
  } catch (error) {
    console.error('Error in checkAndCreateAlerts:', error.message);
    // NO relanzar - evitar que rompa el flujo principal
  }
}


/**
 * Get active alerts
 */
app.get('/daily/alerts/active', auth, async (req, res) => {
  try {
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    const activeAlerts = (dailyRecord.alerts || [])
      .filter(alert => !alert.acknowledged)
      .sort((a, b) => new Date(b.delivered_at) - new Date(a.delivered_at));
    
    res.json({ alerts: activeAlerts });
  } catch (error) {
    console.error('Get active alerts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Acknowledge alert
 */
app.patch('/daily/alerts/:alertId/acknowledge', auth, async (req, res) => {
  try {
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    const alert = dailyRecord.alerts.id(req.params.alertId);
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }
    
    alert.acknowledged = true;
    alert.acknowledged_at = new Date();
    await dailyRecord.save();
    
    res.json({ message: 'Alert acknowledged successfully', alert });
  } catch (error) {
    console.error('Acknowledge alert error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =============================================================================
// MOOD INTEGRATION
// =============================================================================

/**
 * Add mood entry to daily record
 */
app.post('/daily/mood', auth, async (req, res) => {
  try {
    const { mood_score, note } = req.body;
    
    const dailyRecord = await findOrCreateDailyRecord(req.userId);
    
    // Agregar entrada de ánimo
    dailyRecord.mood_entries = dailyRecord.mood_entries || [];
    dailyRecord.mood_entries.push({
      mood_score,
      note,
      recorded_at: new Date()
    });
    
    await dailyRecord.save();
    
    // Disparar nueva predicción de estrés
    setTimeout(async () => {
      try {
        await axios.post(
          `http://localhost:${PORT}/daily/stress/predict`,
          { force_refresh: true },
          { headers: { 'x-user-id': req.userId } }
        );
      } catch (predError) {
        console.error('Auto-prediction after mood entry failed:', predError);
      }
    }, 1000);
    
    res.json({ 
      message: 'Mood entry added successfully',
      mood_entry: dailyRecord.mood_entries[dailyRecord.mood_entries.length - 1]
    });
  } catch (error) {
    console.error('Add mood entry error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate stress statistics
 */
function calculateStressStats(records) {
  if (records.length === 0) {
    return {
      average_stress: 0,
      trend: 'stable',
      high_stress_days: 0,
      improvement_days: 0
    };
  }
  
  const scores = records.map(r => r.stress_prediction.score);
  const average_stress = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  
  // Calcular tendencia
  const recentAvg = scores.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, scores.length);
  const previousAvg = scores.slice(3, 6).reduce((a, b) => a + b, 0) / Math.min(3, scores.length - 3);
  
  let trend = 'stable';
  if (recentAvg < previousAvg - 5) trend = 'improving';
  else if (recentAvg > previousAvg + 5) trend = 'declining';
  
  const high_stress_days = records.filter(r => 
    r.stress_prediction.level === 'high' || r.stress_prediction.level === 'critical'
  ).length;
  
  // Días de mejora (días consecutivos con score decreciente)
  let improvement_days = 0;
  for (let i = 1; i < Math.min(5, scores.length); i++) {
    if (scores[i] < scores[i - 1]) improvement_days++;
  }
  
  return {
    average_stress,
    trend,
    high_stress_days,
    improvement_days,
    total_days: records.length
  };
}

// =============================================================================
// CRON JOBS FOR AUTOMATED PREDICTION
// =============================================================================

/**
 * Automated stress prediction - runs at 8 AM, 2 PM, and 8 PM
 */
cron.schedule('0 8,14,20 * * *', async () => {
  try {
    console.log('Starting automated stress prediction...');
    
    // Obtener usuarios activos
    const users = await User.find({});
    
    for (const user of users) {
      try {
        await axios.post(
          `http://localhost:${PORT}/daily/stress/predict`,
          { force_refresh: false },
          { headers: { 'x-user-id': user._id.toString() } }
        );
        console.log(`Auto-prediction for user ${user._id}`);
      } catch (userError) {
        console.error(`Auto-prediction failed for user ${user._id}:`, userError.message);
      }
    }
  } catch (error) {
    console.error('Error in automated stress prediction:', error);
  }
});



// =============================================================================
// HEALTH CHECK & ERROR HANDLING
// =============================================================================

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'daily-records-service', 
    timestamp: new Date().toISOString() 
  });
});

/**
 * Global error handling middleware
 */
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: error.message })
  });
});

/**
 * 404 handler
 */
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// =============================================================================
// SERVER INITIALIZATION
// =============================================================================

app.listen(PORT, () => {
  console.log(`Daily records service running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
  console.log('Notification scheduler started');
});

module.exports = app;
