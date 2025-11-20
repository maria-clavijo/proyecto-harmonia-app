require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const cron = require('node-cron');
const connectDB = require('../shared/database');
const User = require('./models/User');

const app = express();
const PORT = process.env.USER_SERVICE_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to database
connectDB();

// =============================================================================
// CONFIGURATION
// =============================================================================

const USE_GOOGLE_FIT_SIMULATION = !process.env.GOOGLE_FIT_CLIENT_ID || 
                                 process.env.USE_GOOGLE_FIT_SIMULATION === 'true';

if (USE_GOOGLE_FIT_SIMULATION) {
  console.log('Google Fit Simulation Mode: ACTIVE');
} else {
  console.log('Google Fit Real Mode: ACTIVE');
}

// =============================================================================
// MIDDLEWARES 
// =============================================================================

/**
 * JWT Authentication Middleware 
 */
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // CORREGIDO: Usar req.user en lugar de req.userId para consistencia
    req.user = {
      id: decoded.id,
      role: decoded.role
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// =============================================================================
// HELPER FUNCTIONS - GOOGLE FIT
// =============================================================================

/**
 * Genera datos de sueño simulados
 */
function generateSimulatedSleepData() {
  const sleepHours = (Math.random() * 4) + 6; // 6-10 horas
  return { 
    totalSleepHours: Math.round(sleepHours * 10) / 10,
    simulated: true,
    quality: ['buena', 'regular', 'excelente'][Math.floor(Math.random() * 3)]
  };
}

/**
 * Genera datos de pasos simulados
 */
function generateSimulatedStepsData() {
  const stepCount = Math.floor(Math.random() * 5000) + 3000; // 3000-8000 pasos
  return { 
    stepCount,
    simulated: true,
    activityLevel: stepCount > 7000 ? 'alto' : stepCount > 5000 ? 'medio' : 'bajo'
  };
}

/**
 * Obtiene datos de sueño (real o simulado)
 */
async function getSleepData(accessToken, date) {
  // Modo simulación
  if (USE_GOOGLE_FIT_SIMULATION || accessToken === 'simulated_token') {
    console.log('Using simulated sleep data');
    return generateSimulatedSleepData();
  }

  // Modo real Google Fit
  try {
    const startTime = new Date(date);
    startTime.setHours(0, 0, 0, 0);
    
    const endTime = new Date(date);
    endTime.setHours(23, 59, 59, 999);

    const response = await axios.post(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        aggregateBy: [{
          dataTypeName: "com.google.sleep.segment"
        }],
        bucketByTime: { durationMillis: 24 * 60 * 60 * 1000 },
        startTimeMillis: startTime.getTime(),
        endTimeMillis: endTime.getTime()
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let totalSleepHours = 0;
    const buckets = response.data.bucket || [];
    
    buckets.forEach(bucket => {
      bucket.dataset?.forEach(dataset => {
        dataset.point?.forEach(point => {
          const sleepSegment = point.value[0].intVal;
          if (sleepSegment === 1) { // 1 = sleeping
            const duration = (point.endTimeNanos - point.startTimeNanos) / 1e9 / 3600;
            totalSleepHours += duration;
          }
        });
      });
    });

    return { 
      totalSleepHours: Math.round(totalSleepHours * 10) / 10,
      simulated: false 
    };
  } catch (error) {
    console.error('Error fetching sleep data:', error.response?.data || error.message);
    // Fallback a simulación si hay error
    return generateSimulatedSleepData();
  }
}

/**
 * Obtiene datos de pasos (real o simulado)
 */
async function getStepsData(accessToken, date) {
  // Modo simulación
  if (USE_GOOGLE_FIT_SIMULATION || accessToken === 'simulated_token') {
    console.log('Using simulated steps data');
    return generateSimulatedStepsData();
  }

  // Modo real Google Fit
  try {
    const startTime = new Date(date);
    startTime.setHours(0, 0, 0, 0);
    
    const endTime = new Date(date);
    endTime.setHours(23, 59, 59, 999);

    const response = await axios.post(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        aggregateBy: [{
          dataTypeName: "com.google.step_count.delta",
          dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
        }],
        bucketByTime: { durationMillis: 24 * 60 * 60 * 1000 },
        startTimeMillis: startTime.getTime(),
        endTimeMillis: endTime.getTime()
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let stepCount = 0;
    const buckets = response.data.bucket || [];
    
    buckets.forEach(bucket => {
      bucket.dataset?.forEach(dataset => {
        dataset.point?.forEach(point => {
          stepCount += point.value[0].intVal || 0;
        });
      });
    });

    return { 
      stepCount,
      simulated: false 
    };
  } catch (error) {
    console.error('Error fetching steps data:', error.response?.data || error.message);
    // Fallback a simulación si hay error
    return generateSimulatedStepsData();
  }
}


/**
 * Sincroniza datos de Google Fit con el daily service 
 */
async function syncGoogleFitData(userId, accessToken, date) {
  try {
    console.log(`🔄 Starting Google Fit sync for user ${userId} for date: ${date}`);
    
    const [sleepData, stepsData] = await Promise.all([
      getSleepData(accessToken, date),
      getStepsData(accessToken, date)
    ]);

    // Determinar fuente de datos
    const dataSource = sleepData.simulated ? 'simulation' : 'google_fit';

    // Preparar datos para enviar - CORREGIDO
    const syncData = {
      sleep_hours: sleepData.totalSleepHours,
      steps: stepsData.stepCount,
      source: dataSource,
      date: new Date(date).toISOString().split('T')[0] // Asegurar formato YYYY-MM-DD
    };

    console.log('Sync data prepared:', syncData);

    // Enviar datos al daily service 
    const dailyServicePort = process.env.DAILY_SERVICE_PORT || 3003;
    
    try {
      const dailyRecordResponse = await axios.post(
        `http://localhost:${dailyServicePort}/daily/wellbeing/sync`,
        syncData,
        {
          headers: {
            'x-user-id': userId.toString(),
            'Content-Type': 'application/json'
          },
          timeout: 15000 // Aumentado a 15 segundos
        }
      );

      console.log('Google Fit sync completed successfully');
      console.log('Daily service response:', dailyRecordResponse.data);

      return {
        sleep: sleepData,
        steps: stepsData,
        record: dailyRecordResponse.data.record,
        simulated: sleepData.simulated,
        success: true
      };
    } catch (dailyError) {
      console.error('Error from daily service:', dailyError.response?.data || dailyError.message);
      throw new Error(`Daily service error: ${dailyError.response?.data?.message || dailyError.message}`);
    }
  } catch (error) {
    console.error('Error in syncGoogleFitData:', error);
    throw new Error(`Failed to sync Google Fit data: ${error.message}`);
  }
}

/**
 * Manual Google Fit synchronization - MEJORADO
 */
app.post('/users/me/google-fit/sync', auth, async (req, res) => {
  try {
    const { date, force_simulation } = req.body;
    const syncDate = date ? new Date(date) : new Date();
    
    // Formatear fecha para consistencia
    const formattedDate = syncDate.toISOString().split('T')[0];
    
    console.log(`Manual sync requested for user ${req.user.id}, date: ${formattedDate}`);
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const googleFitIntegration = user.integrations.find(
      int => int.provider === 'google_fit'
    );

    if (!googleFitIntegration) {
      return res.status(400).json({ message: 'Google Fit not connected' });
    }

    // Determinar si forzar simulación
    const useSimulation = force_simulation || googleFitIntegration.is_simulation;

    console.log(`Sync mode: ${useSimulation ? 'simulation' : 'real'}`);

    // Realizar sincronización
    const syncResult = await syncGoogleFitData(
      req.user.id, 
      googleFitIntegration.access_token, 
      formattedDate // Usar fecha formateada
    );

    // Actualizar timestamp de última sincronización
    googleFitIntegration.last_sync_at = new Date();
    await user.save();

    console.log(`Sync completed for user ${req.user.id}`);

    res.json({
      message: useSimulation ? 'Data synced successfully (Simulation)' : 'Data synced successfully',
      ...syncResult,
      mode: useSimulation ? 'simulation' : 'real',
      sync_date: formattedDate
    });

  } catch (error) {
    console.error('Google Fit sync error:', error);
    res.status(500).json({ 
      message: 'Failed to sync Google Fit data',
      error: error.message 
    });
  }
});



// =============================================================================
// AUTHENTICATION ROUTES
// =============================================================================

/**
 * User Registration
 */
app.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password, country, tz } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User with this email already exists' 
      });
    }
    
    // Create new user
    const newUser = new User({
      name,
      email,
      password_hash: password,
      country,
      tz: tz || 'UTC'
    });
    
    await newUser.save();
    
    // Generate JWT token
    const token = jwt.sign(
      { id: newUser._id, name: newUser.name }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        country: newUser.country
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

/**
 * User Login
 */
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Check password
    const isMatch = await user.correctPassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, name: user.name, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        country: user.country,
        role: user.role,
        settings: user.settings
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// =============================================================================
// USER PROFILE ROUTES 
// =============================================================================

/**
 * Get current user profile 
 */
app.get('/users/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password_hash');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Incluir información del modo simulación
    const userResponse = user.toObject();
    userResponse.google_fit_mode = USE_GOOGLE_FIT_SIMULATION ? 'simulation' : 'real';
    
    res.json({ user: userResponse });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Update user profile 
 */
app.patch('/users/me', auth, async (req, res) => {
  try {
    const updates = req.body;
    // CORREGIDO: usar req.user.id
    const user = await User.findByIdAndUpdate(
      req.user.id, 
      updates, 
      { new: true, runValidators: true }
    ).select('-password_hash');
    
    res.json({ 
      message: 'User updated successfully', 
      user 
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error during update' });
  }
});

// =============================================================================
// GOOGLE FIT INTEGRATION ROUTES
// =============================================================================

/**
 * Connect Google Fit account (real o simulado) 
 */
app.post('/users/me/google-fit/connect', auth, async (req, res) => {
  try {
    const { access_token, refresh_token, expires_in, use_simulation } = req.body;
    
    // CORREGIDO: usar req.user.id
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Determinar si usar simulación
    const useSimulationMode = use_simulation || USE_GOOGLE_FIT_SIMULATION;

    if (useSimulationMode) {
      // MODO SIMULACIÓN
      const integrationData = {
        provider: 'google_fit',
        access_token: 'simulated_token',
        refresh_token: 'simulated_refresh_token',
        scopes: ['fitness.simulation'],
        last_sync_at: new Date(),
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 año
        is_simulation: true
      };

      // Actualizar o crear integración
      const integrationIndex = user.integrations.findIndex(
        int => int.provider === 'google_fit'
      );

      if (integrationIndex >= 0) {
        user.integrations[integrationIndex] = integrationData;
      } else {
        user.integrations.push(integrationData);
      }

      user.settings.google_fit_connected = true;
      user.settings.google_fit_simulation = true;
      await user.save();

      return res.json({ 
        message: 'Google Fit connected successfully (Simulation Mode)',
        connected: true,
        simulation: true,
        mode: 'simulation'
      });
    } else {
      // MODO REAL GOOGLE FIT
      if (!access_token) {
        return res.status(400).json({ 
          message: 'Access token required for real Google Fit connection' 
        });
      }

      const integrationData = {
        provider: 'google_fit',
        access_token,
        refresh_token,
        scopes: [
          'https://www.googleapis.com/auth/fitness.activity.read', 
          'https://www.googleapis.com/auth/fitness.sleep.read'
        ],
        last_sync_at: new Date(),
        expires_at: new Date(Date.now() + (expires_in || 3600) * 1000),
        is_simulation: false
      };

      const integrationIndex = user.integrations.findIndex(
        int => int.provider === 'google_fit'
      );

      if (integrationIndex >= 0) {
        user.integrations[integrationIndex] = integrationData;
      } else {
        user.integrations.push(integrationData);
      }

      user.settings.google_fit_connected = true;
      user.settings.google_fit_simulation = false;
      await user.save();

      return res.json({ 
        message: 'Google Fit connected successfully',
        connected: true,
        simulation: false,
        mode: 'real'
      });
    }
  } catch (error) {
    console.error('Google Fit connection error:', error);
    res.status(500).json({ message: 'Failed to connect Google Fit' });
  }
});


/**
 * Manual Google Fit synchronization 
 */
app.post('/users/me/google-fit/sync', auth, async (req, res) => {
  try {
    const { date, force_simulation } = req.body;
    const syncDate = date ? new Date(date) : new Date();
    
    // Formatear fecha para consistencia
    const formattedDate = syncDate.toISOString().split('T')[0];
    
    console.log(`Manual sync requested for user ${req.user.id}, date: ${formattedDate}`);
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const googleFitIntegration = user.integrations.find(
      int => int.provider === 'google_fit'
    );

    if (!googleFitIntegration) {
      return res.status(400).json({ message: 'Google Fit not connected' });
    }

    // Determinar si forzar simulación
    const useSimulation = force_simulation || googleFitIntegration.is_simulation;

    console.log(`Sync mode: ${useSimulation ? 'simulation' : 'real'}`);

    // Realizar sincronización
    const syncResult = await syncGoogleFitData(
      req.user.id, 
      googleFitIntegration.access_token, 
      formattedDate // Usar fecha formateada
    );

    // Actualizar timestamp de última sincronización
    googleFitIntegration.last_sync_at = new Date();
    await user.save();

    console.log(`Sync completed for user ${req.user.id}`);

    res.json({
      message: useSimulation ? 'Data synced successfully (Simulation)' : 'Data synced successfully',
      ...syncResult,
      mode: useSimulation ? 'simulation' : 'real',
      sync_date: formattedDate
    });

  } catch (error) {
    console.error('Google Fit sync error:', error);
    res.status(500).json({ 
      message: 'Failed to sync Google Fit data',
      error: error.message 
    });
  }
});


/**
 * Disconnect Google Fit - CORREGIDO
 */
app.post('/users/me/google-fit/disconnect', auth, async (req, res) => {
  try {
    // CORREGIDO: usar req.user.id
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Remover integración de Google Fit
    user.integrations = user.integrations.filter(
      int => int.provider !== 'google_fit'
    );

    user.settings.google_fit_connected = false;
    await user.save();

    res.json({ 
      message: 'Google Fit disconnected successfully',
      connected: false
    });
  } catch (error) {
    console.error('Google Fit disconnect error:', error);
    res.status(500).json({ message: 'Failed to disconnect Google Fit' });
  }
});

/**
 * Get Google Fit connection status 
 */
app.get('/users/me/google-fit/status', auth, async (req, res) => {
  try {
    // Usar req.user.id
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const googleFitIntegration = user.integrations.find(
      int => int.provider === 'google_fit'
    );

    const status = {
      connected: !!googleFitIntegration,
      simulation: googleFitIntegration?.is_simulation || false,
      last_sync: googleFitIntegration?.last_sync_at,
      mode: USE_GOOGLE_FIT_SIMULATION ? 'simulation' : 'real'
    };

    res.json({ status });
  } catch (error) {
    console.error('Google Fit status error:', error);
    res.status(500).json({ message: 'Failed to get Google Fit status' });
  }
});

// =============================================================================
// NOTIFICATION ROUTES 
// =============================================================================

/**
 * Register notification token for push notifications
 */
app.post('/users/me/notification-token', auth, async (req, res) => {
  try {
    const { token, provider = 'fcm', deviceInfo } = req.body;

    // CORREGIDO: usar req.user.id
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if token already exists
    const existingTokenIndex = user.notification_tokens.findIndex(
      t => t.token === token && t.provider === provider
    );

    if (existingTokenIndex >= 0) {
      user.notification_tokens[existingTokenIndex].device_info = deviceInfo;
      user.notification_tokens[existingTokenIndex].created_at = new Date();
    } else {
      user.notification_tokens.push({
        provider,
        token,
        device_info: deviceInfo,
        created_at: new Date()
      });
    }

    await user.save();

    res.json({ message: 'Notification token registered successfully' });
  } catch (error) {
    console.error('Error registering notification token:', error);
    res.status(500).json({ message: 'Failed to register token' });
  }
});

// =============================================================================
// CRON JOBS - AUTOMATED TASKS 
// =============================================================================

/**
 * Automatic Google Fit synchronization - runs daily at 6 AM 
 */
cron.schedule('0 6 * * *', async () => {
  try {
    console.log('🔄 Starting automatic Google Fit sync...');
    
    const users = await User.find({
      'settings.google_fit_connected': true,
      'integrations.provider': 'google_fit'
    });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    for (const user of users) {
      try {
        const googleFitIntegration = user.integrations.find(
          int => int.provider === 'google_fit'
        );

        if (!googleFitIntegration) continue;

        await syncGoogleFitData(
          user._id.toString(),
          googleFitIntegration.access_token,
          yesterday
        );

        console.log(`Auto-synced Google Fit data for user ${user._id}`);
        
      } catch (userError) {
        console.error(`Error syncing user ${user._id}:`, userError.message);
      }
    }
  } catch (error) {
    console.error('Error in automatic Google Fit sync:', error);
  }
});

// =============================================================================
// HEALTH CHECK & INFO ROUTES
// =============================================================================

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'user-service', 
    timestamp: new Date().toISOString(),
    google_fit_mode: USE_GOOGLE_FIT_SIMULATION ? 'simulation' : 'real'
  });
});

/**
 * Service info endpoint
 */
app.get('/info', (req, res) => {
  res.json({
    service: 'user-service',
    version: '1.0.0',
    features: {
      authentication: true,
      google_fit_integration: true,
      google_fit_simulation: USE_GOOGLE_FIT_SIMULATION,
      notifications: true,
      profile_management: true
    },
    google_fit: {
      mode: USE_GOOGLE_FIT_SIMULATION ? 'simulation' : 'real',
      configured: !!process.env.GOOGLE_FIT_CLIENT_ID
    }
  });
});

// =============================================================================
// ERROR HANDLING MIDDLEWARE
// =============================================================================

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
  console.log(`User service running on port ${PORT}`);
  console.log(`Google Fit Mode: ${USE_GOOGLE_FIT_SIMULATION ? 'SIMULATION' : 'REAL'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Service info: http://localhost:${PORT}/info`);
});

module.exports = app;