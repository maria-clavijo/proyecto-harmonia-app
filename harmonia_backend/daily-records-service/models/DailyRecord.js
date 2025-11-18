const mongoose = require('mongoose');

const wellbeingSchema = new mongoose.Schema({
  sleep_hours: {
    type: Number,
    min: 0,
    max: 24
  },
  steps: {
    type: Number,
    min: 0
  },
  source: {
    type: String,
    enum: ['manual', 'google_fit', 'apple_health', 'fitbit', 'simulation'],
    default: 'manual'
  },
  last_sync_at: Date
});

const stressPredictionSchema = new mongoose.Schema({
  score: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  level: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true
  },
  factors: [{
    factor: String,
    impact: Number,
    description: String
  }],
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.8
  },
  model_version: {
    type: String,
    default: '1.0'
  },
  generated_at: {
    type: Date,
    default: Date.now
  }
});

const recommendationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['exercise', 'breathing', 'mindfulness', 'lifestyle', 'urgent'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  exercise_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise'
  },
  duration_minutes: Number,
  priority: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  completed: {
    type: Boolean,
    default: false
  },
  completed_at: Date
});

const alertSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['stress_alert', 'prevention_alert', 'improvement_alert'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  stress_level: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical']
  },
  delivered_at: {
    type: Date,
    default: Date.now
  },
  acknowledged: {
    type: Boolean,
    default: false
  },
  acknowledged_at: Date
});

const sessionSchema = new mongoose.Schema({
  exercise_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise',
    required: true
  },
  started_at: {
    type: Date,
    required: true
  },
  completed_at: {
    type: Date
  },
  stress_before: Number,
  stress_after: Number,
  effectiveness: Number
});

const dailyRecordSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: () => new Date().setHours(0,0,0,0)
  },
  wellbeing: wellbeingSchema,
  stress_prediction: stressPredictionSchema,
  recommendations: [recommendationSchema],
  alerts: [alertSchema],
  sessions: [sessionSchema],
  mood_entries: [{
    mood_score: Number,
    recorded_at: Date,
    note: String
  }],
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Índices
dailyRecordSchema.index({ user_id: 1, date: 1 }, { unique: true });
dailyRecordSchema.index({ 'stress_prediction.level': 1 });
dailyRecordSchema.index({ 'alerts.delivered_at': 1 });

// Middleware para actualizar updated_at
dailyRecordSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('DailyRecord', dailyRecordSchema);
