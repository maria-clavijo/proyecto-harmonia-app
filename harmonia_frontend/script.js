// Configuración de la API
const API_BASE_URL = 'http://localhost:3001';
const MOOD_API_URL = 'http://localhost:3002';
const DAILY_API_URL = 'http://localhost:3003';
const EXERCISES_API_URL = 'http://localhost:3004';

// Estado de la aplicación
let currentUser = null;
let authToken = null;
let selectedMoodScore = null;
let selectedTags = [];
let currentExercise = null;
let allExercises = [];

// =============================================================================
// INICIALIZACIÓN Y AUTENTICACIÓN
// =============================================================================

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    initApp();
});

// Verificar estado de autenticación
function checkAuthStatus() {
    const token = localStorage.getItem('harmonia_token');
    const user = localStorage.getItem('harmonia_user');
    
    if (token && user) {
        authToken = token;
        currentUser = JSON.parse(user);
        showAuthenticatedScreens();
    } else {
        showScreen('welcome-screen');
    }
}

// Mostrar pantallas autenticadas
function showAuthenticatedScreens() {
    const mainNav = document.getElementById('main-navigation');
    if (mainNav) {
        mainNav.style.display = 'flex';
    }
    
    updateProfileUI();
    toggleAdminFeatures();
    
    // Si es admin, mostrar directamente panel admin
    if (isAdmin()) {
        showScreen('admin-screen');
        loadAdminExercises();
    } else {
        showScreen('dashboard-screen');
        loadDashboardData();
    }
}

// Headers de autenticación para User Service
function getAuthHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    return headers;
}

// Headers para servicios que usan x-user-id
function getServiceHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (currentUser && currentUser.id) {
        headers['x-user-id'] = currentUser.id;
    } else if (authToken) {
        try {
            const payload = JSON.parse(atob(authToken.split('.')[1]));
            headers['x-user-id'] = payload.id;
        } catch (error) {
            console.error('Error decoding token:', error);
        }
    }
    
    return headers;
}

// =============================================================================
// FUNCIONES DE ADMINISTRACIÓN - ADMIN SOLO VE PANEL ADMIN
// =============================================================================

// Verificar si el usuario es admin
function isAdmin() {
    return currentUser && currentUser.role === 'admin';
}

// Mostrar/ocultar funciones de admin
function toggleAdminFeatures() {
    const adminElements = document.querySelectorAll('.admin-only');
    const roleBadge = document.getElementById('profile-role-badge');
    
    if (isAdmin()) {
        adminElements.forEach(element => {
            element.style.display = 'block';
        });
        if (roleBadge) {
            roleBadge.innerHTML = '<i class="fas fa-shield-alt"></i> Administrador';
            roleBadge.className = 'profile-badge admin';
        }
        
        // Ocultar navegación normal para admin
        const mainNav = document.getElementById('main-navigation');
        if (mainNav) {
            mainNav.style.display = 'none';
        }
        
    } else {
        adminElements.forEach(element => {
            element.style.display = 'none';
        });
        if (roleBadge) {
            roleBadge.innerHTML = '<i class="fas fa-user"></i> Usuario';
            roleBadge.className = 'profile-badge';
        }
    }
}

// Mostrar panel de administración
function showAdminPanel() {
    if (!isAdmin()) {
        showAlert('Acceso denegado. Se requieren permisos de administrador.', 'error');
        return;
    }
    showScreen('admin-screen');
    loadAdminExercises();
}

// Volver al dashboard desde admin (solo para casos especiales)
function showUserDashboard() {
    if (isAdmin()) {
        if (confirm('¿Salir del panel de administración y ver dashboard de usuario?')) {
            showScreen('dashboard-screen');
            loadDashboardData();
        }
    } else {
        showScreen('dashboard-screen');
        loadDashboardData();
    }
}

// Cargar ejercicios para administración
async function loadAdminExercises() {
    try {
        const response = await fetch(`${EXERCISES_API_URL}/exercises?limit=100`);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        displayAdminExercises(data.exercises);
        
    } catch (error) {
        console.error('Error loading admin exercises:', error);
        showAlert('Error al cargar ejercicios para administración', 'error');
    }
}

// Mostrar ejercicios en panel admin
function displayAdminExercises(exercises) {
    const container = document.getElementById('admin-exercises-container');
    if (!container) return;

    if (!exercises || exercises.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-dumbbell"></i>
                <p>No hay ejercicios disponibles</p>
                <small>Crea el primer ejercicio usando el botón "Nuevo Ejercicio"</small>
            </div>
        `;
        return;
    }

    container.innerHTML = exercises.map(exercise => `
        <div class="admin-exercise-card">
            <div class="admin-exercise-info">
                <h4>${exercise.title}</h4>
                <p>${getCategoryName(exercise.category)} · ${Math.round(exercise.duration_seconds / 60)} min</p>
                <div class="exercise-tags">
                    ${exercise.tags ? exercise.tags.map(tag => `<span class="tag-small">${tag}</span>`).join('') : ''}
                </div>
                ${exercise.content?.youtube_id ? `
                    <div class="video-indicator">
                        <i class="fab fa-youtube"></i> Con video
                    </div>
                ` : ''}
            </div>
            <div class="admin-actions">
                <button class="btn btn-small" onclick="editExercise('${exercise._id}')">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="btn btn-small btn-danger" onclick="deleteExercise('${exercise._id}')">
                    <i class="fas fa-trash"></i> Eliminar
                </button>
            </div>
        </div>
    `).join('');
}

// Mostrar formulario de creación de ejercicio
function showCreateExerciseForm() {
    showScreen('create-exercise-screen');
}

// Crear nuevo ejercicio
async function createExercise() {
    if (!isAdmin()) {
        showAlert('No tienes permisos para crear ejercicios', 'error');
        return;
    }

    const title = document.getElementById('exercise-title-input').value;
    const category = document.getElementById('exercise-category-select').value;
    const duration = document.getElementById('exercise-duration').value;
    const tags = document.getElementById('exercise-tags').value;
    const youtubeId = document.getElementById('exercise-youtube-id').value;
    const steps = document.getElementById('exercise-steps-textarea').value;

    if (!title || !category || !duration || !steps) {
        showAlert('Por favor completa todos los campos obligatorios', 'error');
        return;
    }

    const formData = {
        title: title,
        category: category,
        duration_seconds: parseInt(duration) * 60,
        tags: tags.split(',').map(tag => tag.trim()).filter(tag => tag),
        content: {
            steps: steps.split('\n').filter(step => step.trim()),
            youtube_id: youtubeId || undefined
        },
        active: true
    };

    try {
        const response = await fetch(`${EXERCISES_API_URL}/exercises`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            showAlert('Ejercicio creado exitosamente', 'success');
            showAdminPanel(); // Volver al panel de admin
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error al crear ejercicio');
        }
    } catch (error) {
        console.error('Error creating exercise:', error);
        showAlert('Error al crear ejercicio: ' + error.message, 'error');
    }
}

// Editar ejercicio (placeholder - implementar según necesidades)
function editExercise(exerciseId) {
    showAlert('Funcionalidad de edición en desarrollo', 'info');
    // Implementar lógica de edición aquí
}

// Eliminar ejercicio
async function deleteExercise(exerciseId) {
    if (!isAdmin()) {
        showAlert('No tienes permisos para eliminar ejercicios', 'error');
        return;
    }

    if (!confirm('¿Estás seguro de que quieres eliminar este ejercicio? Esta acción no se puede deshacer.')) {
        return;
    }

    try {
        const response = await fetch(`${EXERCISES_API_URL}/exercises/${exerciseId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            showAlert('Ejercicio eliminado exitosamente', 'success');
            loadAdminExercises(); // Recargar la lista
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error al eliminar ejercicio');
        }
    } catch (error) {
        console.error('Error deleting exercise:', error);
        showAlert('Error al eliminar ejercicio: ' + error.message, 'error');
    }
}

// =============================================================================
// AUTENTICACIÓN Y REGISTRO
// =============================================================================

// Registro de usuario
async function register() {
    const name = document.getElementById('register-name')?.value;
    const email = document.getElementById('register-email')?.value;
    const password = document.getElementById('register-password')?.value;
    const country = document.getElementById('register-country')?.value;
    
    if (!name || !email || !password || !country) {
        showAlert('Por favor completa todos los campos', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                name, 
                email, 
                password, 
                country, 
                tz: Intl.DateTimeFormat().resolvedOptions().timeZone 
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            
            localStorage.setItem('harmonia_token', authToken);
            localStorage.setItem('harmonia_user', JSON.stringify(currentUser));
            
            showAuthenticatedScreens();
            showAlert('Cuenta creada exitosamente', 'success');
            
            // Conectar Google Fit en modo simulación automáticamente
            await connectGoogleFitSimulation();
            
        } else {
            showAlert(data.message || 'Error en el registro', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error de conexión. Verifica que el backend esté ejecutándose.', 'error');
    }
}

// Inicio de sesión
async function login() {
    const email = document.getElementById('login-email')?.value;
    const password = document.getElementById('login-password')?.value;
    
    if (!email || !password) {
        showAlert('Por favor ingresa email y contraseña', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            
            localStorage.setItem('harmonia_token', authToken);
            localStorage.setItem('harmonia_user', JSON.stringify(currentUser));
            
            showAuthenticatedScreens();
            showAlert('Sesión iniciada correctamente', 'success');
            
            // Sincronizar datos de Google Fit después del login
            await syncGoogleFitData();
            
        } else {
            showAlert(data.message || 'Error en el login', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error de conexión. Verifica que el backend esté ejecutándose.', 'error');
    }
}

// Cerrar sesión
function logout() {
    localStorage.removeItem('harmonia_token');
    localStorage.removeItem('harmonia_user');
    authToken = null;
    currentUser = null;
    
    const mainNav = document.getElementById('main-navigation');
    if (mainNav) {
        mainNav.style.display = 'none';
    }
    
    showScreen('welcome-screen');
    showAlert('Sesión cerrada correctamente', 'success');
}

// =============================================================================
// INTEGRACIÓN GOOGLE FIT - CORREGIDA
// =============================================================================


// Conectar Google Fit en modo simulación - MEJORADA
async function connectGoogleFitSimulation() {
  try {
    
    const response = await fetch(`${API_BASE_URL}/users/me/google-fit/connect`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        use_simulation: true
      })
    });
    
    if (response.ok) {
      console.log('Google Fit simulation connected');
      await syncGoogleFitData();
    } else {
      throw new Error('Failed to connect Google Fit simulation');
    }
  } catch (error) {
    console.error('Error connecting Google Fit simulation:', error);
  }
}


// Sincronizar datos de Google Fit - COMPLETAMENTE CORREGIDA
async function syncGoogleFitData() {
  try {
    console.log('Starting Google Fit sync from frontend...');
    
    const response = await fetch(`${API_BASE_URL}/users/me/google-fit/sync`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        force_simulation: true,
        date: new Date().toISOString().split('T')[0]
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Google Fit sync successful:', data);
      
      // ACTUALIZACIÓN INMEDIATA: Forzar actualización de datos en el dashboard
      await loadWellbeingData();
      await loadStressPrediction();
      
      // Recargar el dashboard completamente
      setTimeout(() => {
        loadDashboardData();
      }, 1000);
      
    } else {
      const errorData = await response.json();
      console.error('Google Fit sync failed:', errorData);
      throw new Error(errorData.message || 'Error en la sincronización');
    }
  } catch (error) {
    console.error('Error syncing Google Fit data:', error);
    
    // MEJORADO: Intentar usar datos simulados como fallback
    await simulateWellbeingData();
  }
}


// Datos simulados como fallback - COMPLETAMENTE CORREGIDA
async function simulateWellbeingData() {
  console.log('Using simulated wellbeing data as fallback');
  
  const simulatedData = {
    sleep_hours: parseFloat((6 + Math.random() * 3).toFixed(1)), // 6-9 horas
    steps: Math.floor(3000 + Math.random() * 7000), // 3000-10000 pasos
    source: 'simulation'
  };
  
  try {
    // Guardar datos simulados directamente en el daily service
    const response = await fetch(`${DAILY_API_URL}/daily/wellbeing`, {
      method: 'POST',
      headers: getServiceHeaders(),
      body: JSON.stringify(simulatedData)
    });
    
    if (response.ok) {
      console.log('Simulated data saved successfully');
      updateWellbeingUI(simulatedData);
    } else {
      console.error('Failed to save simulated data');
      // Mostrar datos aunque falle el guardado
      updateWellbeingUI(simulatedData);
    }
  } catch (error) {
    console.error('Error in simulateWellbeingData:', error);
    // Mostrar datos aunque falle completamente
    updateWellbeingUI(simulatedData);
  }
}


// =============================================================================
// NAVEGACIÓN Y UI
// =============================================================================

// Navegación entre pantallas
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
    
    updateNavigation(screenId);
    
    // Cargar datos específicos de la pantalla
    switch(screenId) {
        case 'weekly-screen':
            loadWeeklySummary();
            break;
        case 'dashboard-screen':
            loadDashboardData();
            break;
        case 'mood-screen':
            resetMoodForm();
            break;
        case 'profile-screen':
            loadProfileData();
            break;
        case 'exercises-screen':
            loadAllExercises();
            break;
        case 'admin-screen':
            if (isAdmin()) {
                loadAdminExercises();
            }
            break;
    }
}

// Actualizar navegación
function updateNavigation(screenId) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    const navMap = {
        'dashboard-screen': 'inicio',
        'exercises-screen': 'ejercicios',
        'weekly-screen': 'resumen',
        'mood-screen': 'check-in',
        'profile-screen': 'perfil'
    };
    
    const currentNav = navMap[screenId];
    navItems.forEach(item => {
        if (item.textContent.toLowerCase().includes(currentNav)) {
            item.classList.add('active');
        }
    });
}

// Actualizar UI del perfil
function updateProfileUI() {
    if (currentUser) {
        const welcomeElement = document.getElementById('dashboard-welcome');
        if (welcomeElement) {
            welcomeElement.textContent = `Hola, ${currentUser.name || 'Usuario'}`;
        }
        
        const profileName = document.getElementById('profile-name');
        const profileEmail = document.getElementById('profile-email');
        const profileInitial = document.getElementById('profile-initial');
        
        if (profileName) profileName.textContent = currentUser.name || 'Usuario';
        if (profileEmail) profileEmail.textContent = currentUser.email || 'usuario@ejemplo.com';
        if (profileInitial) {
            profileInitial.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();
        }
    }
}

// Cargar datos del perfil - CORREGIDA
async function loadProfileData() {
    if (!currentUser) return;
    
    try {
        // Actualizar información básica del usuario
        updateProfileUI();
        
        // Calcular días activos desde la creación de la cuenta
        const today = new Date();
        const accountCreation = new Date(currentUser.createdAt || today);
        const daysActive = Math.max(1, Math.floor((today - accountCreation) / (1000 * 60 * 60 * 24)));
        
        // Cargar estadísticas reales
        const [moodResponse, sessionsResponse] = await Promise.all([
            fetch(`${MOOD_API_URL}/mood?limit=1000`, { headers: getServiceHeaders() }),
            fetch(`${DAILY_API_URL}/daily/sessions?limit=1000`, { headers: getServiceHeaders() })
        ]);
        
        let checkinsCount = 0;
        let exercisesCount = 0;
        
        if (moodResponse.ok) {
            const moodData = await moodResponse.json();
            checkinsCount = moodData.entries ? moodData.entries.length : 0;
        }
        
        if (sessionsResponse.ok) {
            const sessionsData = await sessionsResponse.json();
            exercisesCount = sessionsData.sessions ? sessionsData.sessions.length : 0;
        }
        
        // Actualizar UI
        document.getElementById('profile-days-active').textContent = daysActive;
        document.getElementById('profile-checkins').textContent = checkinsCount;
        document.getElementById('profile-exercises').textContent = exercisesCount;
        
    } catch (error) {
        console.error('Error loading profile data:', error);
        // Valores por defecto
        document.getElementById('profile-days-active').textContent = '1';
        document.getElementById('profile-checkins').textContent = '0';
        document.getElementById('profile-exercises').textContent = '0';
    }
}

// =============================================================================
// DASHBOARD PRINCIPAL - NUEVO SISTEMA DE PREDICCIÓN DE ESTRÉS
// =============================================================================

// Cargar datos del dashboard
async function loadDashboardData() {
    if (!currentUser || isAdmin()) return;
    
    try {
        await Promise.all([
            loadWellbeingData(),
            loadStressPrediction(),
            loadExerciseCount(),
            loadPendingNotifications(),
            loadActiveAlerts(),
            loadActiveRecommendations()
        ]);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}


// Cargar datos de bienestar - COMPLETAMENTE CORREGIDA
async function loadWellbeingData() {
  if (!currentUser) return;
  
  try {
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    
    console.log('Loading wellbeing data for date:', todayString);
    
    const response = await fetch(`${DAILY_API_URL}/daily/wellbeing?from=${todayString}&to=${todayString}`, {
      headers: getServiceHeaders()
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Wellbeing data loaded:', data);
      
      if (data.records && data.records.length > 0 && data.records[0].wellbeing) {
        updateWellbeingUI(data.records[0].wellbeing);
      } else {
        console.log('No wellbeing data found, attempting sync...');
        // Si no hay datos, intentar sincronizar
        await syncGoogleFitData();
      }
    } else {
      console.error('Error loading wellbeing data, status:', response.status);
      showDefaultWellbeingUI();
    }
  } catch (error) {
    console.error('Error loading wellbeing data:', error);
    showDefaultWellbeingUI();
  }
}


// Actualizar la interfaz con datos reales - MEJORADA
function updateWellbeingUI(wellbeingData) {
  const sleepHoursElement = document.getElementById('sleep-hours');
  const stepsCountElement = document.getElementById('steps-count');
  
  console.log('Updating wellbeing UI with:', wellbeingData);
  
  if (sleepHoursElement) {
    sleepHoursElement.textContent = wellbeingData.sleep_hours ? 
        `${parseFloat(wellbeingData.sleep_hours).toFixed(1)}h` : '--h';
  }
  
  if (stepsCountElement) {
    stepsCountElement.textContent = wellbeingData.steps ? 
        wellbeingData.steps.toLocaleString() : '--';
  }
  
  // Mostrar fuente de datos
  if (wellbeingData.source === 'simulation') {
    console.log('Showing simulated data');
  } else {
    console.log('Showing real Google Fit data');
  }
}


// Cargar contador de ejercicios
async function loadExerciseCount() {
    if (!currentUser) return;
    
    try {
        const today = new Date();
        const todayString = today.toISOString().split('T')[0];
        
        const response = await fetch(`${DAILY_API_URL}/daily/sessions?from=${todayString}&to=${todayString}`, {
            headers: getServiceHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            const exerciseCountElement = document.getElementById('exercise-count');
            
            if (exerciseCountElement && data.sessions) {
                exerciseCountElement.textContent = data.sessions.length;
            }
        }
    } catch (error) {
        console.error('Error loading exercise count:', error);
        const exerciseCountElement = document.getElementById('exercise-count');
        if (exerciseCountElement) {
            exerciseCountElement.textContent = '0';
        }
    }
}

// =============================================================================
// NUEVO SISTEMA DE PREDICCIÓN DE ESTRÉS CON IA
// =============================================================================

// Cargar predicción de estrés actual
async function loadStressPrediction() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${DAILY_API_URL}/daily/stress/today`, {
            headers: getServiceHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            updateStressPredictionUI(data);
        } else if (response.status === 404) {
            // No hay predicción para hoy, generar una
            await generateStressPrediction();
        } else {
            showDefaultStressUI();
        }
    } catch (error) {
        console.error('Error loading stress prediction:', error);
        showDefaultStressUI();
    }
}

// Generar nueva predicción de estrés
async function generateStressPrediction() {
    try {
        showAlert('Generando predicción de estrés...', 'info');
        
        const response = await fetch(`${DAILY_API_URL}/daily/stress/predict`, {
            method: 'POST',
            headers: getServiceHeaders(),
            body: JSON.stringify({
                force_refresh: true
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            updateStressPredictionUI(data);
            showAlert('Predicción generada correctamente', 'success');
        } else {
            throw new Error('Error generating prediction');
        }
    } catch (error) {
        console.error('Error generating stress prediction:', error);
        showDefaultStressUI();
    }
}

// Actualizar UI con la predicción de estrés
function updateStressPredictionUI(data) {
    const stressCard = document.getElementById('stress-card');
    const stressValue = document.getElementById('stress-value');
    const stressLabel = document.getElementById('stress-label');
    const stressIcon = document.getElementById('stress-icon');
    const stressFill = document.getElementById('stress-fill');
    const stressFactors = document.getElementById('stress-factors');
    
    if (!stressCard || !stressValue || !stressLabel || !stressIcon || !stressFill) {
        return;
    }
    
    if (data.prediction) {
        const prediction = data.prediction;
        const score = prediction.score;
        const level = prediction.level;
        
        stressValue.textContent = score;
        stressFill.style.width = `${score}%`;
        
        // Determinar nivel y estilo
        let cardClass, labelText, icon;
        
        switch(level) {
            case 'low':
                cardClass = 'stress-card stress-low';
                labelText = 'Bajo - ¡Excelente!';
                icon = '😊';
                break;
            case 'medium':
                cardClass = 'stress-card stress-medium';
                labelText = 'Moderado - Mantén el equilibrio';
                icon = '😐';
                break;
            case 'high':
                cardClass = 'stress-card stress-high';
                labelText = 'Alto - Cuida tu bienestar';
                icon = '😔';
                break;
            case 'critical':
                cardClass = 'stress-card stress-critical';
                labelText = 'Crítico - Necesita atención';
                icon = '🚨';
                break;
            default:
                cardClass = 'stress-card';
                labelText = 'Nivel no determinado';
                icon = '📊';
        }
        
        stressCard.className = cardClass;
        stressLabel.textContent = labelText;
        stressIcon.textContent = icon;
        
        // Mostrar factores si existen
        if (stressFactors && prediction.factors && prediction.factors.length > 0) {
            const mainFactor = prediction.factors[0];
            stressFactors.innerHTML = `
                <div class="stress-factor">
                    <strong>Factor principal:</strong> ${mainFactor.description}
                </div>
            `;
        }
        
    } else {
        showDefaultStressUI();
    }
}

// Mostrar UI por defecto para estrés
function showDefaultStressUI() {
    const stressCard = document.getElementById('stress-card');
    const stressValue = document.getElementById('stress-value');
    const stressLabel = document.getElementById('stress-label');
    const stressIcon = document.getElementById('stress-icon');
    const stressFill = document.getElementById('stress-fill');
    
    if (!stressCard || !stressValue || !stressLabel || !stressIcon || !stressFill) {
        return;
    }
    
    stressCard.className = 'stress-card';
    stressValue.textContent = '--';
    stressLabel.textContent = 'Generando predicción...';
    stressIcon.textContent = '📊';
    stressFill.style.width = '0%';
}

// =============================================================================
// SISTEMA DE ALERTAS Y RECOMENDACIONES
// =============================================================================

// Cargar alertas activas
async function loadActiveAlerts() {
    try {
        const response = await fetch(`${DAILY_API_URL}/daily/alerts/active`, {
            headers: getServiceHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            displayActiveAlerts(data.alerts);
        }
    } catch (error) {
        console.error('Error loading active alerts:', error);
    }
}

// Mostrar alertas activas
function displayActiveAlerts(alerts) {
    const alertContainer = document.getElementById('alert-container');
    if (!alertContainer) return;
    
    alertContainer.innerHTML = '';
    
    if (!alerts || alerts.length === 0) {
        return;
    }
    
    alerts.forEach(alert => {
        const alertElement = document.createElement('div');
        alertElement.className = `alert alert-${getAlertType(alert.type)}`;
        alertElement.innerHTML = `
            <div class="alert-icon">
                <i class="fas ${getAlertIcon(alert.type)}"></i>
            </div>
            <div>
                <strong>${alert.title}</strong>
                <p>${alert.message}</p>
                <button class="btn btn-small" onclick="acknowledgeAlert('${alert._id}')" style="margin-top: 10px;">
                    <i class="fas fa-check"></i> Entendido
                </button>
            </div>
        `;
        alertContainer.appendChild(alertElement);
    });
}

// Reconocer alerta
async function acknowledgeAlert(alertId) {
    try {
        const response = await fetch(`${DAILY_API_URL}/daily/alerts/${alertId}/acknowledge`, {
            method: 'PATCH',
            headers: getServiceHeaders(),
            body: JSON.stringify({ acknowledged: true })
        });
        
        if (response.ok) {
            showAlert('Alerta reconocida', 'success');
            loadActiveAlerts(); // Recargar alertas
        }
    } catch (error) {
        console.error('Error acknowledging alert:', error);
        showAlert('Error al reconocer la alerta', 'error');
    }
}

// Cargar recomendaciones activas
async function loadActiveRecommendations() {
    try {
        const response = await fetch(`${DAILY_API_URL}/daily/recommendations/active`, {
            headers: getServiceHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            displayActiveRecommendations(data.recommendations);
        }
    } catch (error) {
        console.error('Error loading active recommendations:', error);
    }
}

// Mostrar recomendaciones activas
function displayActiveRecommendations(recommendations) {
    const container = document.getElementById('recommendations-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!recommendations || recommendations.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-lightbulb"></i>
                <p>No hay recomendaciones activas</p>
                <small>Completa un check-in para obtener recomendaciones personalizadas</small>
            </div>
        `;
        return;
    }
    
    recommendations.forEach(rec => {
        const recElement = document.createElement('div');
        recElement.className = 'exercise-card';
        recElement.innerHTML = `
            <div class="exercise-icon">
                <i class="fas ${getRecommendationIcon(rec.type)}"></i>
            </div>
            <div class="exercise-info">
                <div class="exercise-title">${rec.title}</div>
                <div class="exercise-detail">${rec.description}</div>
                ${rec.duration_minutes ? `<div class="exercise-meta">${rec.duration_minutes} min</div>` : ''}
            </div>
            <button class="btn btn-small" onclick="startRecommendedExercise('${rec._id}')">
                <i class="fas fa-play"></i>
            </button>
        `;
        container.appendChild(recElement);
    });
}

// Iniciar ejercicio recomendado
async function startRecommendedExercise(recommendationId) {
    try {
        // Marcar como completado
        const response = await fetch(`${DAILY_API_URL}/daily/recommendations/${recommendationId}/complete`, {
            method: 'PATCH',
            headers: getServiceHeaders()
        });
        
        if (response.ok) {
            showAlert('Recomendación marcada como completada', 'success');
            loadActiveRecommendations(); // Recargar recomendaciones
        }
    } catch (error) {
        console.error('Error completing recommendation:', error);
        showAlert('Error al completar la recomendación', 'error');
    }
}

// =============================================================================
// CHECK-IN DE ÁNIMO - INTEGRADO CON NUEVO SISTEMA
// =============================================================================

// Seleccionar estado de ánimo
function selectMood(element, score) {
    document.querySelectorAll('.mood-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');
    selectedMoodScore = score;
}

// Alternar etiqueta
function toggleTag(element, tag) {
    element.classList.toggle('selected');
    
    if (element.classList.contains('selected')) {
        if (!selectedTags.includes(tag)) {
            selectedTags.push(tag);
        }
    } else {
        selectedTags = selectedTags.filter(t => t !== tag);
    }
}

// Enviar check-in de ánimo - AHORA GENERA PREDICCIÓN AUTOMÁTICA
async function submitMood() {
    if (!selectedMoodScore) {
        showAlert('Por favor selecciona cómo te sientes', 'error');
        return;
    }
    
    if (!currentUser) {
        showAlert('Error de autenticación. Por favor, reinicia sesión.', 'error');
        return;
    }
    
    try {
        const moodNoteElement = document.getElementById('mood-note');
        const note = moodNoteElement ? moodNoteElement.value : '';
        
        // 1. Guardar entrada de ánimo
        const moodResponse = await fetch(`${MOOD_API_URL}/mood`, {
            method: 'POST',
            headers: getServiceHeaders(),
            body: JSON.stringify({
                mood_score: selectedMoodScore,
                note: note,
                tags: selectedTags,
                date: new Date().toISOString()
            })
        });
        
        if (!moodResponse.ok) {
            const errorData = await moodResponse.json();
            throw new Error(errorData.message || 'Error al guardar check-in');
        }
        
        // 2. También guardar en daily record para el sistema de predicción
        await fetch(`${DAILY_API_URL}/daily/mood`, {
            method: 'POST',
            headers: getServiceHeaders(),
            body: JSON.stringify({
                mood_score: selectedMoodScore,
                note: note
            })
        });
        
        showAlert('Check-in guardado correctamente', 'success');
        resetMoodForm();
        
        // 3. Generar nueva predicción de estrés basada en el check-in
        setTimeout(async () => {
            await generateStressPrediction();
        }, 1000);
        
        // Volver al dashboard
        setTimeout(() => {
            showScreen('dashboard-screen');
            loadDashboardData();
        }, 2000);
        
    } catch (error) {
        console.error('Error en submitMood:', error);
        showAlert(`Error al guardar el check-in: ${error.message}`, 'error');
    }
}

// Resetear formulario de ánimo
function resetMoodForm() {
    selectedMoodScore = null;
    selectedTags = [];
    
    document.querySelectorAll('.mood-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    document.querySelectorAll('.tag').forEach(tag => {
        tag.classList.remove('selected');
    });
    
    const moodNote = document.getElementById('mood-note');
    if (moodNote) {
        moodNote.value = '';
    }
    
    const charCount = document.getElementById('char-count');
    if (charCount) {
        charCount.textContent = '0/140 caracteres';
    }
}

// =============================================================================
// EJERCICIOS - CORREGIDOS (CLICK Y FILTROS FUNCIONANDO)
// =============================================================================

// Cargar todos los ejercicios para la página dedicada
async function loadAllExercises() {
    try {
        const response = await fetch(`${EXERCISES_API_URL}/exercises`);
        
        if (response.ok) {
            const data = await response.json();
            allExercises = data.exercises || [];
            displayAllExercises(allExercises);
        } else {
            throw new Error('Error al cargar ejercicios');
        }
    } catch (error) {
        console.error('Error loading all exercises:', error);
        const container = document.getElementById('all-exercises-container');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error al cargar ejercicios</p>
                    <small>Intenta nuevamente más tarde</small>
                </div>
            `;
        }
    }
}

// Mostrar todos los ejercicios en grid
function displayAllExercises(exercises) {
    const container = document.getElementById('all-exercises-container');
    if (!container) return;
    
    if (!exercises || exercises.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-dumbbell"></i>
                <p>No hay ejercicios disponibles</p>
                <small>Vuelve más tarde para ver nuevos ejercicios</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = exercises.map(exercise => `
        <div class="exercise-grid-card" onclick="showExerciseDetail(${JSON.stringify(exercise).replace(/"/g, '&quot;')})">
            <div class="exercise-grid-icon">
                <i class="fas ${getExerciseIcon(exercise.category)}"></i>
            </div>
            <div class="exercise-grid-info">
                <h4>${exercise.title}</h4>
                <p>${Math.round(exercise.duration_seconds / 60)} min · ${getCategoryName(exercise.category)}</p>
                ${exercise.content?.youtube_id ? `
                    <div class="video-indicator">
                        <i class="fab fa-youtube"></i> Con video
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Filtrar ejercicios por búsqueda
function filterExercises() {
    const searchTerm = document.getElementById('exercise-search').value.toLowerCase();
    const exercises = document.querySelectorAll('.exercise-grid-card');
    
    exercises.forEach(exercise => {
        const text = exercise.textContent.toLowerCase();
        exercise.style.display = text.includes(searchTerm) ? 'block' : 'none';
    });
}

// Filtrar por categoría - CORREGIDO (usa inglés como en la BD)
function filterByCategory(category) {
    // Actualizar botones activos
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    if (category === 'all') {
        displayAllExercises(allExercises);
    } else {
        const filteredExercises = allExercises.filter(exercise => 
            exercise.category === category
        );
        displayAllExercises(filteredExercises);
    }
}

// Obtener icono según categoría
function getExerciseIcon(category) {
    switch(category) {
        case 'breathing': return 'fa-wind';
        case 'mindfulness': return 'fa-spa';
        case 'sound': return 'fa-music';
        case 'meditation': return 'fa-om';
        case 'movement': return 'fa-running';
        default: return 'fa-heart';
    }
}

// Obtener nombre de categoría
function getCategoryName(category) {
    switch(category) {
        case 'breathing': return 'Respiración';
        case 'mindfulness': return 'Mindfulness';
        case 'sound': return 'Sonido';
        case 'meditation': return 'Meditación';
        case 'movement': return 'Movimiento';
        default: return category;
    }
}

// Mostrar detalle de ejercicio - CORREGIDO (ahora funciona el click)
function showExerciseDetail(exercise) {
    // Si exercise es string, parsearlo
    if (typeof exercise === 'string') {
        try {
            exercise = JSON.parse(exercise.replace(/&quot;/g, '"'));
        } catch (e) {
            console.error('Error parsing exercise:', e);
            return;
        }
    }
    
    currentExercise = exercise;
    
    const titleElement = document.getElementById('exercise-title');
    const categoryElement = document.getElementById('exercise-category');
    const stepsContainer = document.getElementById('exercise-steps');
    const videoContainer = document.getElementById('exercise-video-container');
    
    if (titleElement) titleElement.textContent = exercise.title;
    if (categoryElement) {
        categoryElement.textContent = `${Math.round(exercise.duration_seconds / 60)} min · ${getCategoryName(exercise.category)}`;
    }
    
    if (stepsContainer) {
        let stepsHTML = '';
        
        // Agregar video de YouTube si existe
        if (exercise.content?.youtube_id) {
            stepsHTML += `
                <div class="video-container">
                    <h3 class="section-title">
                        <i class="fab fa-youtube"></i> Video Guiado
                    </h3>
                    <div class="youtube-embed">
                        <iframe 
                            width="100%" 
                            height="200" 
                            src="https://www.youtube.com/embed/${exercise.content.youtube_id}" 
                            frameborder="0" 
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowfullscreen>
                        </iframe>
                    </div>
                </div>
            `;
        }
        
        // Agregar pasos del ejercicio
        if (exercise.content && exercise.content.steps && exercise.content.steps.length > 0) {
            stepsHTML += `
                <div class="instructions-container">
                    <h3 class="section-title">
                        <i class="fas fa-list-ol"></i> Instrucciones
                    </h3>
                    ${exercise.content.steps.map((step, index) => `
                        <div class="exercise-step">
                            <div class="step-number">${index + 1}</div>
                            <div class="step-text">${step}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            stepsHTML += '<p>No hay instrucciones disponibles para este ejercicio.</p>';
        }
        
        stepsContainer.innerHTML = stepsHTML;
    }
    
    showScreen('exercise-detail-screen');
}

// Volver a ejercicios desde detalle
function goBackToExercises() {
    showScreen('exercises-screen');
    loadAllExercises();
}

// Iniciar ejercicio
function startExercise() {
    if (!currentExercise || !currentUser) return;
    
    const button = document.querySelector('#exercise-detail-screen .btn-primary');
    const originalText = button.innerHTML;
    
    button.innerHTML = '<div class="loading"></div> Ejercicio en progreso';
    button.disabled = true;
    
    // Simular progreso del ejercicio
    let progress = 0;
    const duration = currentExercise.duration_seconds || 300; // 5 minutos por defecto
    const interval = setInterval(() => {
        progress += 10;
        if (progress >= 100) {
            clearInterval(interval);
            completeExercise();
        }
    }, (duration * 1000) / 10);
    
    async function completeExercise() {
        try {
            const response = await fetch(`${DAILY_API_URL}/daily/sessions`, {
                method: 'POST',
                headers: getServiceHeaders(),
                body: JSON.stringify({
                    exercise_id: currentExercise._id,
                    started_at: new Date(),
                    completed_at: new Date()
                })
            });
            
            if (response.ok) {
                showAlert('¡Ejercicio completado!', 'success');
                button.innerHTML = '<i class="fas fa-check"></i> Completado';
                
                // Generar nueva predicción después del ejercicio
                setTimeout(async () => {
                    await generateStressPrediction();
                }, 1000);
                
                setTimeout(() => {
                    showScreen('dashboard-screen');
                    button.innerHTML = originalText;
                    button.disabled = false;
                    loadDashboardData(); // Recargar datos
                }, 1500);
            } else {
                throw new Error('Error recording exercise');
            }
        } catch (error) {
            console.error('Error recording exercise:', error);
            button.innerHTML = originalText;
            button.disabled = false;
            showAlert('Error al registrar el ejercicio', 'error');
        }
    }
}

// =============================================================================
// RESUMEN SEMANAL - ACTUALIZADO CON NUEVO SISTEMA
// =============================================================================


// Cargar resumen semanal - COMPLETAMENTE CORREGIDO
async function loadWeeklySummary() {
    if (!currentUser) return;
    
    try {
        console.log('Cargando resumen semanal...');
        
        const response = await fetch(`${DAILY_API_URL}/daily/summary/weekly`, {
            headers: getServiceHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Resumen semanal cargado:', data);
            
            if (data.success) {
                updateWeeklyView(data);
            } else {
                throw new Error(data.message || 'Error en el servidor');
            }
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || `Error HTTP: ${response.status}`);
        }
    } catch (error) {
        console.error('Error loading weekly summary:', error);
        showAlert('Error al cargar el resumen semanal: ' + error.message, 'error');
        await createManualWeeklySummary();
    }
}

// Crear resumen semanal manual como fallback - MEJORADO
async function createManualWeeklySummary() {
    try {
        console.log('Creando resumen semanal manual...');
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 7);
        
        const from = startDate.toISOString().split('T')[0];
        const to = endDate.toISOString().split('T')[0];
        
        const [wellbeingResponse, sessionsResponse, stressResponse, moodResponse] = await Promise.all([
            fetch(`${DAILY_API_URL}/daily/wellbeing?from=${from}&to=${to}`, { headers: getServiceHeaders() }),
            fetch(`${DAILY_API_URL}/daily/sessions?from=${from}&to=${to}`, { headers: getServiceHeaders() }),
            fetch(`${DAILY_API_URL}/daily/stress/history?days=7`, { headers: getServiceHeaders() }),
            fetch(`${MOOD_API_URL}/mood?from=${from}&to=${to}`, { headers: getServiceHeaders() })
        ]);
        
        let wellbeingData = { records: [] };
        let sessionsData = { sessions: [] };
        let stressData = { history: [] };
        let moodData = { entries: [] };
        
        if (wellbeingResponse.ok) wellbeingData = await wellbeingResponse.json();
        if (sessionsResponse.ok) sessionsData = await sessionsResponse.json();
        if (stressResponse.ok) stressData = await stressResponse.json();
        if (moodResponse.ok) moodData = await moodResponse.json();
        
        // Procesar datos manualmente
        const weeklyData = {
            success: true,
            week_start: startDate,
            week_end: endDate,
            summary: calculateManualWeeklySummary(wellbeingData, sessionsData, stressData, moodData),
            records: []
        };
        
        console.log('Resumen manual creado:', weeklyData.summary);
        updateWeeklyView(weeklyData);
        
    } catch (error) {
        console.error('Error creating manual summary:', error);
        showEmptyWeeklyView();
    }
}

// Calcular resumen semanal manual - ACTUALIZADO
function calculateManualWeeklySummary(wellbeingData, sessionsData, stressData, moodData) {
    const summary = {
        total_days: 7,
        average_stress: 0,
        average_sleep: 0,
        average_steps: 0,
        total_exercise_sessions: 0,
        total_mood_entries: 0,
        days_with_data: 0,
        stress_trend: 'stable',
        sleep_trend: 'stable',
        activity_trend: 'stable'
    };

    // Procesar datos de estrés
    if (stressData.history && stressData.history.length > 0) {
        const stressScores = stressData.history.map(day => day.stress_score).filter(score => score);
        summary.average_stress = stressScores.length > 0 ? 
            Math.round(stressScores.reduce((a, b) => a + b, 0) / stressScores.length) : 0;
        summary.days_with_data = Math.max(summary.days_with_data, stressScores.length);
    }

    // Procesar datos de bienestar
    if (wellbeingData.records && wellbeingData.records.length > 0) {
        const sleepHours = wellbeingData.records.map(r => r.wellbeing?.sleep_hours).filter(h => h);
        const steps = wellbeingData.records.map(r => r.wellbeing?.steps).filter(s => s);
        
        summary.average_sleep = sleepHours.length > 0 ? 
            parseFloat((sleepHours.reduce((a, b) => a + b, 0) / sleepHours.length).toFixed(1)) : 0;
        summary.average_steps = steps.length > 0 ? 
            Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : 0;
        
        summary.days_with_data = Math.max(summary.days_with_data, sleepHours.length, steps.length);
    }

    // Procesar ejercicios y mood entries
    summary.total_exercise_sessions = sessionsData.sessions ? sessionsData.sessions.length : 0;
    summary.total_mood_entries = moodData.entries ? moodData.entries.length : 0;

    return summary;
}

// Actualizar vista semanal - COMPLETAMENTE CORREGIDA
function updateWeeklyView(data) {
    const datesElement = document.getElementById('weekly-dates');
    const chartContainer = document.getElementById('weekly-chart');
    const recommendationsContainer = document.getElementById('weekly-recommendations-container'); // ID CORREGIDO
    
    if (!datesElement || !chartContainer) {
        console.error('Elementos del DOM no encontrados');
        return;
    }
    
    // Verificar si hay datos
    if (!data.success || !data.summary || data.summary.days_with_data === 0) {
        showEmptyWeeklyView();
        return;
    }
    
    const summary = data.summary;
    
    // Actualizar fechas
    const startDate = new Date(data.week_start).toLocaleDateString('es-ES', { 
        day: 'numeric', month: 'short' 
    });
    const endDate = new Date(data.week_end).toLocaleDateString('es-ES', { 
        day: 'numeric', month: 'short' 
    });
    datesElement.textContent = `Semana del ${startDate} al ${endDate}`;
    
    // Crear gráfico con datos reales
    createWeeklyChart(chartContainer, summary);
    
    // Generar recomendaciones basadas en datos reales
    if (recommendationsContainer) {
        generateWeeklyRecommendations(recommendationsContainer, summary);
    }
    
    console.log('Vista semanal actualizada correctamente');
}

// Mostrar vista vacía
function showEmptyWeeklyView() {
    const datesElement = document.getElementById('weekly-dates');
    const chartContainer = document.getElementById('weekly-chart');
    const recommendationsContainer = document.getElementById('weekly-recommendations-container');
    
    if (datesElement) {
        datesElement.textContent = 'No hay datos disponibles para esta semana';
    }
    
    if (chartContainer) {
        chartContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-chart-bar"></i>
                <p>No hay datos para mostrar esta semana</p>
                <small>Completa algunos check-ins y ejercicios para ver tu progreso</small>
            </div>
        `;
    }
    
    if (recommendationsContainer) {
        recommendationsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-lightbulb"></i>
                <p>Completa al menos un check-in para obtener recomendaciones</p>
            </div>
        `;
    }
}

// Crear gráfico semanal - VERSIÓN MEJORADA Y RESPONSIVE
function createWeeklyChart(container, summary) {
    container.innerHTML = '';
    
    // Validar que summary existe
    if (!summary) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Datos no disponibles</p>
                <small>No se pudieron cargar los datos del resumen</small>
            </div>
        `;
        return;
    }

    const stats = [
        { 
            label: 'Estrés Promedio', 
            value: summary.average_stress || 0, 
            max: 100, 
            color: '#6A5ACD',
            icon: 'fa-brain',
            trend: summary.stress_trend || 'stable',
            format: (v) => `${v}/100`,
            description: 'Nivel promedio de estrés esta semana'
        },
        { 
            label: 'Horas de Sueño', 
            value: summary.average_sleep || 0, 
            max: 10, 
            color: '#4CAF50',
            icon: 'fa-bed',
            trend: summary.sleep_trend || 'stable',
            format: (v) => `${v}h`,
            description: 'Promedio de horas de sueño por noche'
        },
        { 
            label: 'Pasos Diarios', 
            value: summary.average_steps || 0, 
            max: 10000, 
            color: '#2196F3',
            icon: 'fa-walking',
            trend: summary.activity_trend || 'stable',
            format: (v) => v >= 1000 ? `${Math.round(v/1000)}k` : v,
            description: 'Promedio de pasos por día'
        },
        { 
            label: 'Ejercicios', 
            value: summary.total_exercise_sessions || 0, 
            max: Math.max(7, summary.total_exercise_sessions || 0), // Máximo dinámico
            color: '#FF9800',
            icon: 'fa-running',
            trend: 'stable',
            format: (v) => `${v} sesión${v !== 1 ? 'es' : ''}`,
            description: 'Total de ejercicios completados'
        }
    ];
    
    stats.forEach(stat => {
        // Calcular porcentaje seguro
        const percentage = stat.max > 0 ? Math.min(100, (stat.value / stat.max) * 100) : 0;
        const trendIcon = getTrendIcon(stat.trend);
        const trendColor = getTrendColor(stat.trend);
        const trendText = getTrendText(stat.trend);
        
        const bar = document.createElement('div');
        bar.className = 'weekly-stat-card';
        bar.innerHTML = `
            <div class="weekly-stat-header">
                <div class="weekly-stat-icon" style="background: ${stat.color}20; color: ${stat.color}">
                    <i class="fas ${stat.icon}"></i>
                </div>
                <div class="weekly-stat-info">
                    <div class="weekly-stat-label" title="${stat.description}">${stat.label}</div>
                    <div class="weekly-stat-value">${stat.format(stat.value)}</div>
                </div>
                <div class="weekly-stat-trend" style="color: ${trendColor}" title="${trendText}">
                    <i class="fas ${trendIcon}"></i>
                </div>
            </div>
            <div class="weekly-stat-bar">
                <div class="weekly-stat-fill" 
                     style="width: ${percentage}%; background: ${stat.color}"
                     title="${Math.round(percentage)}% del objetivo">
                </div>
            </div>
        `;
        
        container.appendChild(bar);
    });

    // Animación de entrada
    setTimeout(() => {
        const cards = container.querySelectorAll('.weekly-stat-card');
        cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 100);
        });
    }, 100);
}

// Función auxiliar para texto de tendencia
function getTrendText(trend) {
    switch(trend) {
        case 'improving': return 'Mejorando esta semana';
        case 'declining': return 'Necesita atención';
        default: return 'Estable esta semana';
    }
}

// Obtener icono de tendencia
function getTrendIcon(trend) {
    switch(trend) {
        case 'improving': return 'fa-arrow-up';
        case 'declining': return 'fa-arrow-down';
        default: return 'fa-minus';
    }
}

// Obtener color de tendencia
function getTrendColor(trend) {
    switch(trend) {
        case 'improving': return '#4CAF50';
        case 'declining': return '#f44336';
        default: return '#666';
    }
}

// Generar recomendaciones semanales - MEJORADO
function generateWeeklyRecommendations(container, summary) {
    container.innerHTML = '';
    
    const recommendations = [];
    
    // Recomendaciones basadas en estrés
    if (summary.average_stress > 70) {
        recommendations.push({
            type: 'warning',
            icon: 'fa-exclamation-triangle',
            title: 'Estrés Elevado',
            message: `Tu nivel de estrés semanal es alto (${summary.average_stress}/100). Practica más ejercicios de respiración.`,
            action: 'Ver ejercicios de respiración'
        });
    } else if (summary.average_stress < 30) {
        recommendations.push({
            type: 'success',
            icon: 'fa-check-circle',
            title: 'Excelente Manejo del Estrés',
            message: `¡Mantienes un nivel de estrés saludable (${summary.average_stress}/100)! Continúa con tus hábitos.`,
            action: 'Mantener rutina'
        });
    }
    
    // Recomendaciones basadas en sueño
    if (summary.average_sleep < 6) {
        recommendations.push({
            type: 'warning',
            icon: 'fa-bed',
            title: 'Sueño Insuficiente',
            message: `Tu promedio de ${summary.average_sleep}h de sueño está por debajo de lo recomendado (7-9h).`,
            action: 'Mejorar hábitos de sueño'
        });
    } else if (summary.average_sleep >= 7) {
        recommendations.push({
            type: 'success',
            icon: 'fa-moon',
            title: 'Buen Descanso',
            message: `Tu patrón de sueño es saludable (${summary.average_sleep}h). ¡Sigue así!`,
            action: 'Continuar rutina'
        });
    }
    
    // Recomendaciones basadas en actividad
    if (summary.average_steps < 5000) {
        recommendations.push({
            type: 'info',
            icon: 'fa-walking',
            title: 'Aumentar Actividad',
            message: `Intenta aumentar tu actividad (${Math.round(summary.average_steps/1000)}k pasos/día).`,
            action: 'Añadir caminatas'
        });
    } else if (summary.average_steps >= 8000) {
        recommendations.push({
            type: 'success',
            icon: 'fa-trophy',
            title: 'Excelente Actividad',
            message: `¡Gran nivel de actividad (${Math.round(summary.average_steps/1000)}k pasos/día)!`,
            action: 'Mantener ritmo'
        });
    }
    
    // Recomendaciones basadas en ejercicios
    if (summary.total_exercise_sessions < 3) {
        recommendations.push({
            type: 'info',
            icon: 'fa-heart',
            title: 'Más Ejercicios de Relajación',
            message: `Has completado ${summary.total_exercise_sessions} ejercicios esta semana.`,
            action: 'Practicar más ejercicios'
        });
    } else {
        recommendations.push({
            type: 'success',
            icon: 'fa-star',
            title: 'Rutina Activa',
            message: `¡Excelente! ${summary.total_exercise_sessions} ejercicios esta semana.`,
            action: 'Continuar práctica'
        });
    }
    
    if (recommendations.length === 0) {
        recommendations.push({
            type: 'info',
            icon: 'fa-info-circle',
            title: 'Comienza tu Viaje',
            message: 'Completa tu primer check-in para obtener recomendaciones personalizadas.',
            action: 'Hacer check-in'
        });
    }
    
    recommendations.forEach(rec => {
        const alert = document.createElement('div');
        alert.className = `alert alert-${rec.type}`;
        alert.innerHTML = `
            <div class="alert-icon">
                <i class="fas ${rec.icon}"></i>
            </div>
            <div class="alert-content">
                <strong>${rec.title}</strong>
                <p>${rec.message}</p>
                <button class="btn btn-small" onclick="handleWeeklyRecommendation('${rec.action}')">
                    ${rec.action}
                </button>
            </div>
        `;
        container.appendChild(alert);
    });
}

// Manejar acción de recomendación semanal
function handleWeeklyRecommendation(action) {
    switch(action) {
        case 'Ver ejercicios de respiración':
            showScreen('exercises-screen');
            filterByCategory('breathing');
            break;
        case 'Practicar más ejercicios':
            showScreen('exercises-screen');
            break;
        case 'Hacer check-in':
            showScreen('mood-screen');
            break;
        case 'Mejorar hábitos de sueño':
            showAlert('Próximamente: Guía para mejorar el sueño', 'info');
            break;
        default:
            showAlert(`Acción: ${action}`, 'info');
    }
}


// Cambiar pestaña en vista semanal
function changeWeeklyTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
    });
    
    // Activar la pestaña clickeada
    event.target.classList.add('active');
    
    // En una implementación real, aquí cargarías datos diferentes según la pestaña
    // Por ahora recargamos el mismo resumen
    loadWeeklySummary();
}



// =============================================================================
// NOTIFICACIONES PENDIENTES (MANTENIDAS PARA COMPATIBILIDAD)
// =============================================================================

// Cargar notificaciones pendientes
async function loadPendingNotifications() {
    try {
        const response = await fetch(`${DAILY_API_URL}/daily/notifications/pending`, {
            headers: getServiceHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.hasNotification) {
                showNotificationAlert(data.notification);
            }
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

// Mostrar alerta de notificación
function showNotificationAlert(notification) {
    const alertContainer = document.getElementById('alert-container');
    if (!alertContainer) return;
    
    alertContainer.innerHTML = `
        <div class="alert alert-info">
            <div class="alert-icon">
                <i class="fas fa-bell"></i>
            </div>
            <div>
                <strong>${notification.title}</strong>
                <p>${notification.body}</p>
                <div style="margin-top: 10px;">
                    ${notification.actions.map(action => 
                        `<button class="btn btn-small" onclick="handleNotificationResponse('${notification.alertId}', '${action}')">${action}</button>`
                    ).join('')}
                </div>
            </div>
        </div>
    `;
}

// Manejar respuesta de notificación
async function handleNotificationResponse(alertId, action) {
    try {
        const response = await fetch(`${DAILY_API_URL}/daily/notifications/handle-response`, {
            method: 'POST',
            headers: getServiceHeaders(),
            body: JSON.stringify({
                alertId: alertId,
                action: action,
                responseText: action
            })
        });
        
        if (response.ok) {
            document.getElementById('alert-container').innerHTML = '';
            showAlert('Respuesta registrada', 'success');
        }
    } catch (error) {
        console.error('Error handling notification:', error);
    }
}

// =============================================================================
// FUNCIONES UTILITARIAS
// =============================================================================

// Mostrar alertas
function showAlert(message, type, containerId = null) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
        <div class="alert-icon">
            <i class="fas ${getAlertIcon(type)}"></i>
        </div>
        <div>${message}</div>
    `;
    
    if (containerId) {
        const targetContainer = document.getElementById(containerId);
        if (targetContainer) {
            targetContainer.innerHTML = '';
            targetContainer.appendChild(alert);
        }
    } else {
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            max-width: 90%;
            width: 350px;
        `;
        
        document.body.appendChild(alert);
        
        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, 5000);
    }
}

// Obtener icono para alerta
function getAlertIcon(type) {
    switch(type) {
        case 'success': return 'fa-check-circle';
        case 'error': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        default: return 'fa-info-circle';
    }
}

// Obtener tipo de alerta para CSS
function getAlertType(alertType) {
    switch(alertType) {
        case 'stress_alert': return 'warning';
        case 'prevention_alert': return 'info';
        case 'improvement_alert': return 'success';
        default: return 'info';
    }
}

// Obtener icono para recomendación
function getRecommendationIcon(type) {
    switch(type) {
        case 'exercise': return 'fa-running';
        case 'breathing': return 'fa-wind';
        case 'mindfulness': return 'fa-spa';
        case 'lifestyle': return 'fa-heart';
        case 'urgent': return 'fa-exclamation-triangle';
        default: return 'fa-lightbulb';
    }
}

// Configurar navegación
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const text = this.textContent.trim().toLowerCase();
            switch(text) {
                case 'inicio':
                    showScreen('dashboard-screen');
                    break;
                case 'ejercicios':
                    showScreen('exercises-screen');
                    break;
                case 'resumen':
                    showScreen('weekly-screen');
                    break;
                case 'check-in':
                    showScreen('mood-screen');
                    break;
                case 'perfil':
                    showScreen('profile-screen');
                    break;
            }
        });
    });
}

// Inicialización de la aplicación
function initApp() {
    console.log('Aplicación Harmonia inicializada correctamente');
    
    // Configurar el contador de caracteres para notas de ánimo
    const moodNote = document.getElementById('mood-note');
    if (moodNote) {
        moodNote.addEventListener('input', function() {
            const charCount = this.value.length;
            const charCountElement = document.getElementById('char-count');
            if (charCountElement) {
                charCountElement.textContent = `${charCount}/140 caracteres`;
            }
        });
    }
    
    // Configurar botones de navegación
    setupNavigation();
}

// Función para sincronizar datos
function syncWellbeingData() {
    syncGoogleFitData();
}

// Función para generar predicción manualmente
function generatePrediction() {
    generateStressPrediction();
}

