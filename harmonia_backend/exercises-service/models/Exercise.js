const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  steps: [{
    type: String,
    required: true
  }],
  video_url: {
    type: String,
    trim: true
  },
  audio_url: {
    type: String,
    trim: true
  },
  youtube_id: {
    type: String,
    trim: true
  },
  thumbnail_url: String,
  instructor: String,
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  }
});

const exerciseSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true, // Ya crea un índice único automáticamente
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['breathing', 'mindfulness', 'sound', 'movement', 'meditation'],
    lowercase: true
  },
  duration_seconds: {
    type: Number,
    required: true,
    min: 30
  },
  content: contentSchema,
  active: {
    type: Boolean,
    default: true
  },
  tags: [String],
  created_at: {
    type: Date,
    default: Date.now
  }
});

// SOLO ESTOS ÍNDICES - ELIMINADO EL DUPLICADO DE SLUG
exerciseSchema.index({ category: 1, active: 1 });
exerciseSchema.index({ tags: 1 });

module.exports = mongoose.model('Exercise', exerciseSchema);
