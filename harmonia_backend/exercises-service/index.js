require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('../shared/database');
const Exercise = require('./models/Exercise');
const { requireAuth, requireAdmin } = require('../shared/auth');

const app = express();
const PORT = process.env.EXERCISES_SERVICE_PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to database
connectDB();

// =============================================================================
// MIDDLEWARE DE AUTENTICACIÓN SIMPLIFICADO
// =============================================================================

/**
 * Simple authentication middleware for user ID
 */
const authUser = async (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ message: 'User ID required' });
  }
  req.userId = userId;
  next();
};

// =============================================================================
// RUTAS PÚBLICAS
// =============================================================================

/**
 * Get exercises with filtering
 */
app.get('/exercises', async (req, res) => {
  try {
    const { category, search, limit, has_multimedia } = req.query;
    let query = { active: true };
    
    // Category filter
    if (category) {
      query.category = category.toLowerCase();
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Multimedia filter
    if (has_multimedia === 'true') {
      query.$or = [
        { 'content.youtube_id': { $exists: true, $ne: '' } },
        { 'content.video_url': { $exists: true, $ne: '' } },
        { 'content.audio_url': { $exists: true, $ne: '' } }
      ];
    }
    
    const exercises = await Exercise.find(query)
      .limit(parseInt(limit) || 100)
      .sort({ title: 1 });
    
    res.json({ exercises });
  } catch (error) {
    console.error('Error getting exercises:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get exercise by ID
 */
app.get('/exercises/:id', async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    
    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }
    
    if (!exercise.active) {
      return res.status(404).json({ message: 'Exercise not available' });
    }
    
    res.json({ exercise });
  } catch (error) {
    console.error('Error getting exercise:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =============================================================================
// RUTAS DE ADMINISTRACIÓN
// =============================================================================

/**
 * Create exercise (admin only)
 */
app.post('/exercises', requireAuth, requireAdmin, async (req, res) => {
  try {
    const newExercise = new Exercise(req.body);
    await newExercise.save();
    
    res.status(201).json({ 
      message: 'Exercise created successfully',
      exercise: newExercise 
    });
  } catch (error) {
    console.error('Error creating exercise:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Exercise with this slug already exists' });
    }
    
    res.status(500).json({ message: 'Server error creating exercise' });
  }
});

/**
 * Update exercise (admin only)
 */
app.patch('/exercises/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const exercise = await Exercise.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true, runValidators: true }
    );
    
    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }
    
    res.json({ 
      message: 'Exercise updated successfully',
      exercise 
    });
  } catch (error) {
    console.error('Error updating exercise:', error);
    res.status(500).json({ message: 'Server error updating exercise' });
  }
});

/**
 * Delete exercise (admin only)
 */
app.delete('/exercises/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const exercise = await Exercise.findByIdAndDelete(req.params.id);
    
    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }
    
    res.json({ message: 'Exercise deleted successfully' });
  } catch (error) {
    console.error('Error deleting exercise:', error);
    res.status(500).json({ message: 'Server error deleting exercise' });
  }
});

/**
 * Get all exercises including inactive (admin only)
 */
app.get('/admin/exercises', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { limit, page } = req.query;
    const pageSize = parseInt(limit) || 50;
    const currentPage = parseInt(page) || 1;
    const skip = (currentPage - 1) * pageSize;
    
    const exercises = await Exercise.find({})
      .skip(skip)
      .limit(pageSize)
      .sort({ created_at: -1 });
    
    const total = await Exercise.countDocuments();
    
    res.json({ 
      exercises,
      pagination: {
        page: currentPage,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.error('Error getting admin exercises:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =============================================================================
// RUTAS DE CATEGORÍAS Y TAGS
// =============================================================================

/**
 * Get available categories
 */
app.get('/exercises/categories', async (req, res) => {
  try {
    const categories = await Exercise.distinct('category', { active: true });
    res.json({ categories });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get available tags
 */
app.get('/exercises/tags', async (req, res) => {
  try {
    const tags = await Exercise.distinct('tags', { active: true });
    res.json({ tags: tags.filter(tag => tag) }); // Filtrar null/undefined
  } catch (error) {
    console.error('Error getting tags:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =============================================================================
// INICIALIZACIÓN DE DATOS DE EJEMPLO
// =============================================================================

/**
 * Initialize with enhanced sample data
 */
async function initializeSampleData() {
  try {
    const count = await Exercise.countDocuments();
    
    if (count === 0) {
      const sampleExercises = [
        {
          slug: "respiracion-4-7-8",
          title: "Respiración 4-7-8 Relajante",
          category: "breathing",
          duration_seconds: 300,
          tags: ["relajación", "sueño", "ansiedad"],
          content: {
            steps: [
              "Siéntate en una posición cómoda con la espalda recta",
              "Exhala completamente por la boca",
              "Cierra la boca e inhala por la nariz durante 4 segundos",
              "Aguanta la respiración durante 7 segundos",
              "Exhala completamente por la boca durante 8 segundos",
              "Repite el ciclo 4 veces"
            ],
            youtube_id: "EGO5m_DBzF8",
            video_url: "https://www.youtube.com/watch?v=EGO5m_DBzF8",
            audio_url: "https://example.com/audio/respiracion-4-7-8.mp3",
            instructor: "Dr. Andrew Weil",
            difficulty: "beginner"
          },
          active: true
        },
        {
          slug: "meditacion-mindfulness-5min",
          title: "Meditación Mindfulness 5 Minutos",
          category: "meditation",
          duration_seconds: 300,
          tags: ["mindfulness", "concentración", "presente"],
          content: {
            steps: [
              "Encuentra una posición cómoda, sentado o acostado",
              "Cierra los ojos y lleva tu atención a la respiración",
              "Observa el aire entrando y saliendo de tu cuerpo",
              "Cuando surjan pensamientos, obsérvalos sin juzgar",
              "Regresa suavemente a la respiración",
              "Expande tu conciencia a todo tu cuerpo"
            ],
            youtube_id: "ssss7V1_eyA",
            video_url: "https://www.youtube.com/watch?v=ssss7V1_eyA",
            audio_url: "https://example.com/audio/mindfulness-5min.mp3",
            instructor: "Jon Kabat-Zinn",
            difficulty: "beginner"
          },
          active: true
        },
        {
          slug: "sonidos-naturaleza-lluvia",
          title: "Sonidos Relajantes de Lluvia",
          category: "sound",
          duration_seconds: 600,
          tags: ["naturaleza", "sueño", "relajación"],
          content: {
            steps: [
              "Busca un lugar tranquilo donde no te molesten",
              "Usa auriculares para una experiencia inmersiva",
              "Ajusta el volumen a un nivel cómodo",
              "Deja que los sonidos te envuelvan",
              "Respira profundamente y suelta las tensiones",
              "Permite que tu mente descanse con el sonido"
            ],
            youtube_id: "DDubtRhOEGw",
            video_url: "https://www.youtube.com/watch?v=DDubtRhOEGw",
            audio_url: "https://example.com/audio/lluvia-relajante.mp3",
            instructor: "Naturaleza",
            difficulty: "beginner"
          },
          active: true
        },
        {
          slug: "yoga-cara-alivio-estres",
          title: "Yoga Facial para Aliviar el Estrés",
          category: "movement",
          duration_seconds: 420,
          tags: ["yoga", "facial", "tensión"],
          content: {
            steps: [
              "Siéntate cómodamente con la espalda recta",
              "Frota tus manos para generar calor",
              "Masajea suavemente tu rostro con las palmas",
              "Realiza movimientos circulares en las sienes",
              "Estira suavemente los músculos faciales",
              "Termina con una sonrisa consciente"
            ],
            youtube_id: "RqihDdOJ48E",
            video_url: "https://www.youtube.com/watch?v=RqihDdOJ48E",
            audio_url: "https://example.com/audio/yoga-facial.mp3",
            instructor: "Ana Flores",
            difficulty: "beginner"
          },
          active: true
        },
        {
          slug: "body-scan-relajacion",
          title: "Body Scan para Relajación Profunda",
          category: "mindfulness",
          duration_seconds: 900,
          tags: ["relajación", "cuerpo", "tensión"],
          content: {
            steps: [
              "Acuéstate boca arriba en una superficie cómoda",
              "Cierra los ojos y lleva atención a tus pies",
              "Escanea mentalmente cada parte de tu cuerpo",
              "Libera la tensión en cada área",
              "Respira hacia las zonas de incomodidad",
              "Permanece en estado de relajación profunda"
            ],
            youtube_id: "Nw3Kn_VvTpY",
            video_url: "https://www.youtube.com/watch?v=Nw3Kn_VvTpY",
            audio_url: "https://example.com/audio/body-scan.mp3",
            instructor: "Tara Brach",
            difficulty: "intermediate"
          },
          active: true
        }
      ];
      
      await Exercise.insertMany(sampleExercises);
      console.log('Enhanced sample exercises added to database');
    }
  } catch (error) {
    console.error('Error initializing sample data:', error);
  }
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
    service: 'exercises-service', 
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

// Initialize sample data on startup
initializeSampleData();

app.listen(PORT, () => {
  console.log(`Exercises service running on port ${PORT}`);
  console.log(`MongoDB Connected: localhost`);
});

module.exports = app;
