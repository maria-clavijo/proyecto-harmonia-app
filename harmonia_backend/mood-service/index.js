require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('../shared/database');
const MoodEntry = require('./models/MoodEntry');

const app = express();
const PORT = process.env.MOOD_SERVICE_PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to database
connectDB();

// =============================================================================
// MIDDLEWARES
// =============================================================================

/**
 * Simple authentication middleware
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
// RUTAS DE ENTRADAS DE ÁNIMO
// =============================================================================

/**
 * Create mood entry
 */

// En mood-service/index.js - CORREGIR el endpoint de mood
app.post('/mood', auth, async (req, res) => {
  try {
    const { mood_score, note, tags, date, skip_auto_prediction = false } = req.body; // NUEVO PARÁMETRO
    
    // Validar score
    if (mood_score < 0 || mood_score > 100) {
      return res.status(400).json({ message: 'Mood score must be between 0 and 100' });
    }
    
    const newEntry = new MoodEntry({
      user_id: req.userId,
      mood_score,
      note: note || '',
      tags: tags || [],
      date: date || new Date()
    });
    
    await newEntry.save();
    
    // EVITAR BUCLE - solo predecir si no se solicita omitir
    if (!skip_auto_prediction) {
      setTimeout(async () => {
        try {
          await axios.post(
            `http://localhost:${process.env.DAILY_SERVICE_PORT || 3003}/daily/stress/predict`,
            { force_refresh: true },
            { 
              headers: { 'x-user-id': req.userId },
              timeout: 5000
            }
          );
        } catch (predError) {
          console.log('⚠️ Mood-triggered prediction failed:', predError.message);
        }
      }, 3000); // Retraso más largo
    }
    
    res.json({ 
      message: 'Mood entry added successfully',
      mood_entry: newEntry
    });
  } catch (error) {
    console.error('Add mood entry error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


/**
 * Get mood entries with filtering
 */
app.get('/mood', auth, async (req, res) => {
  try {
    const { from, to, tag, limit } = req.query;
    let query = { user_id: req.userId };
    
    // Date range filter
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    
    // Tag filter
    if (tag) {
      query.tags = tag;
    }
    
    const entries = await MoodEntry.find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit) || 100);
    
    // Calcular estadísticas
    const stats = {
      total: entries.length,
      average: entries.length > 0 ? 
        Math.round(entries.reduce((sum, entry) => sum + entry.mood_score, 0) / entries.length) : 0,
      latest: entries.length > 0 ? entries[0].mood_score : null
    };
    
    res.json({ 
      entries,
      stats
    });
  } catch (error) {
    console.error('Error getting mood entries:', error);
    res.status(500).json({ message: 'Server error getting mood entries' });
  }
});

/**
 * Get mood entry by ID
 */
app.get('/mood/:id', auth, async (req, res) => {
  try {
    const entry = await MoodEntry.findOne({
      _id: req.params.id,
      user_id: req.userId
    });
    
    if (!entry) {
      return res.status(404).json({ message: 'Mood entry not found' });
    }
    
    res.json({ entry });
  } catch (error) {
    console.error('Error getting mood entry:', error);
    res.status(500).json({ message: 'Server error getting mood entry' });
  }
});

/**
 * Update mood entry
 */
app.patch('/mood/:id', auth, async (req, res) => {
  try {
    const { mood_score, note, tags } = req.body;
    
    const entry = await MoodEntry.findOne({
      _id: req.params.id,
      user_id: req.userId
    });
    
    if (!entry) {
      return res.status(404).json({ message: 'Mood entry not found' });
    }
    
    // Actualizar campos
    if (mood_score !== undefined) {
      if (mood_score < 0 || mood_score > 100) {
        return res.status(400).json({ message: 'Mood score must be between 0 and 100' });
      }
      entry.mood_score = mood_score;
    }
    
    if (note !== undefined) entry.note = note;
    if (tags !== undefined) entry.tags = tags;
    
    await entry.save();
    
    res.json({
      message: 'Mood entry updated successfully',
      entry
    });
  } catch (error) {
    console.error('Error updating mood entry:', error);
    res.status(500).json({ message: 'Server error updating mood entry' });
  }
});

/**
 * Delete mood entry
 */
app.delete('/mood/:id', auth, async (req, res) => {
  try {
    const entry = await MoodEntry.findOne({
      _id: req.params.id,
      user_id: req.userId
    });
    
    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }
    
    await MoodEntry.deleteOne({ _id: req.params.id });
    
    res.json({ message: 'Mood entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting mood entry:', error);
    res.status(500).json({ message: 'Server error deleting mood entry' });
  }
});

// =============================================================================
// RUTAS DE ESTADÍSTICAS
// =============================================================================

/**
 * Get mood statistics
 */
app.get('/mood/stats', auth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const entries = await MoodEntry.find({
      user_id: req.userId,
      date: { $gte: startDate }
    }).sort({ date: 1 });

    const stats = {
      period: `${days} days`,
      totalEntries: entries.length,
      averageMood: entries.length > 0 ? 
        Math.round(entries.reduce((sum, entry) => sum + entry.mood_score, 0) / entries.length) : 0,
      moodTrend: calculateMoodTrend(entries),
      entriesByTag: calculateTagsStats(entries),
      dailyAverages: calculateDailyAverages(entries)
    };

    res.json({ stats });
  } catch (error) {
    console.error('Error getting mood stats:', error);
    res.status(500).json({ message: 'Server error getting mood statistics' });
  }
});

/**
 * Calculate mood trend
 */
function calculateMoodTrend(entries) {
  if (entries.length < 2) return 'stable';
  
  const recentAvg = entries.slice(-7).reduce((sum, entry) => sum + entry.mood_score, 0) / 7;
  const previousAvg = entries.slice(0, -7).reduce((sum, entry) => sum + entry.mood_score, 0) / (entries.length - 7);
  
  return recentAvg > previousAvg + 5 ? 'improving' : 
         recentAvg < previousAvg - 5 ? 'declining' : 'stable';
}

/**
 * Calculate tags statistics
 */
function calculateTagsStats(entries) {
  const tagCounts = {};
  entries.forEach(entry => {
    entry.tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  return tagCounts;
}

/**
 * Calculate daily averages
 */
function calculateDailyAverages(entries) {
  const dailyData = {};
  entries.forEach(entry => {
    const date = entry.date.toISOString().split('T')[0];
    if (!dailyData[date]) {
      dailyData[date] = { sum: 0, count: 0 };
    }
    dailyData[date].sum += entry.mood_score;
    dailyData[date].count++;
  });

  return Object.entries(dailyData).map(([date, data]) => ({
    date,
    average: Math.round(data.sum / data.count)
  }));
}

// =============================================================================
// HEALTH CHECK & ERROR HANDLING
// =============================================================================

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'mood-service', 
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
  console.log(`Mood service running on port ${PORT}`);
  console.log(`MongoDB Connected: localhost`);
});

module.exports = app;
