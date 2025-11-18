const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const notificationTokenSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true
  },
  token: {
    type: String,
    required: true
  },
  device_info: {
    type: String
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

const integrationSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: ['google_fit', 'apple_health', 'fitbit']
  },
  access_token: {
    type: String,
    required: true
  },
  refresh_token: String,
  scopes: [String],
  last_sync_at: {
    type: Date
  },
  expires_at: Date,
  is_simulation: {
    type: Boolean,
    default: false
  }
});

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email inválido']
  },
  password_hash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  country: {
    type: String,
    required: true
  },
  tz: {
    type: String,
    required: true,
    default: 'UTC'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  settings: {
    max_notifications_per_day: {
      type: Number,
      default: 3
    },
    quiet_mode_until: Date,
    privacy_anonymous: {
      type: Boolean,
      default: false
    },
    biometric_lock: {
      type: Boolean,
      default: false
    },
    notifications_enabled: {
      type: Boolean,
      default: true
    },
    google_fit_connected: {
      type: Boolean,
      default: false
    },
    google_fit_simulation: {
      type: Boolean,
      default: true
    },
    notification_preferences: {
      morning_checkin: { type: Boolean, default: true },
      afternoon_followup: { type: Boolean, default: true },
      evening_reflection: { type: Boolean, default: true },
      exercise_reminders: { type: Boolean, default: true }
    }
  },
  notification_tokens: [notificationTokenSchema],
  integrations: [integrationSchema],
  created_at: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password_hash')) return next();
  this.password_hash = await bcrypt.hash(this.password_hash, 12);
  next();
});

userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

module.exports = mongoose.model('User', userSchema);
