const mongoose = require('mongoose');

const moodEntrySchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  mood_score: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  note: {
    type: String,
    trim: true,
    maxlength: 500
  },
  tags: [{
    type: String,
    trim: true
  }],
  created_at: {
    type: Date,
    default: Date.now
  }
});


moodEntrySchema.index({ user_id: 1, date: 1 });


module.exports = mongoose.model('MoodEntry', moodEntrySchema);