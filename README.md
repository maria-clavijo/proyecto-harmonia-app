# Harmonia - Tu Compañero de Bienestar Mental

![Harmonia Logo](https://img.shields.io/badge/Harmonia-Bienestar_Mental-6A5ACD?style=for-the-badge&logo=heart&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-16%2B-green?style=for-the-badge&logo=node.js)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-green?style=for-the-badge&logo=mongodb)
![Machine Learning](https://img.shields.io/badge/AI-Model-orange?style=for-the-badge&logo=python)

---

## Tabla de Contenidos

- [Introducción](#introduccion)
- [Características Principales](#caracteristicas-principales)
- [Modelos Entrenados y Notebook](#modelos-entrenados-y-notebook-de-entrenamiento)
- [Tecnologías Utilizadas](#tecnologias-utilizadas)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Instalación y Configuración](#instalacion-y-configuracion)
- [Uso de la Aplicación](#uso-de-la-aplicacion)
- [Desarrollo](#desarrollo)
- [API Documentation](#api-documentation)


## Introducción

**Harmonia** es una aplicación de bienestar mental que combina inteligencia artificial, seguimiento de salud y técnicas de mindfulness para ayudarte a gestionar el estrés y mejorar tu calidad de vida.


## Características Principales

### **Sistema de Predicción de Estrés con IA**
- Análisis en tiempo real de múltiples factores (sueño, actividad, estado de ánimo)
- Modelo de machine learning que aprende de tus patrones
- Alertas proactivas cuando detecta niveles elevados de estrés
- Factores explicativos para entender las predicciones

### **Dashboard Inteligente**
- Vista consolidada de tu bienestar general
- Métricas clave: sueño, pasos, ejercicios completados
- Gráficos interactivos y visualizaciones claras
- Actualizaciones en tiempo real

### **Biblioteca de Ejercicios**
- **Respiración**: Técnicas 4-7-8, respiración cuadrada
- **Mindfulness**: Meditaciones guiadas, body scan
- **Sonido**: Terapias de sonido relajantes
- **Movimiento**: Yoga facial, estiramientos suaves
- **Meditación**: Sesiones de diferentes duraciones
- **Contenido multimedia**: Videos de YouTube integrados

### **Check-in Emocional**
- Registro fácil de tu estado de ánimo
- Etiquetas y notas personales
- Integración automática con el sistema de predicción

### **Resumen Semanal**
- Análisis de tendencias y progreso
- Recomendaciones personalizadas basadas en tu semana
- Promedios de sueño, actividad, estrés

### **Panel de Administración**
- Gestión completa de ejercicios
- Creación y edición de contenido
- Modo administrador con vistas especiales


## Modelos Entrenados y Notebook

### Modelos de Machine Learning y Dataset

| Tipo | Archivo | Descripción |
|------|---------|-------------|
| Clasificación | `rf_classifier_stress.pkl` | Predice nivel de estrés |
| Regresión | `rf_regressor_score.pkl` | Predice puntuación total de bienestar |
| Dataset Sintético | `dataset_generated.csv` | Usado para entrenar los modelos |

Los modelos fueron generados en el notebook:

notebooks/stress_model.ipynb

### **¿Qué contiene el notebook?**

- Generación del dataset sintético con variables realistas.
- Feature engineering y cálculo del `total_score`.
- Asignación automática del nivel de estrés usando reglas.
- Entrenamiento del modelo Random Forest (clasificación y regresión).
- Matriz de confusión, importancia de features, métricas.
- Guardado de los modelos finales.


## Tecnologías Utilizadas

### **Backend**
```yaml
Runtime: Node.js 16+
Framework: Express.js
Database: MongoDB con Mongoose
Authentication: JWT (JSON Web Tokens)
APIs: Google Fit, servicios personalizados
Cron Jobs: node-cron para tareas automatizadas
```

### **Frontend**
```yaml
Arquitectura: Single Page Application (SPA)
Lenguaje: JavaScript Vanilla (ES6+)
Styling: CSS3 con Variables Custom
Icons: Font Awesome 6
Design: Mobile-First, Responsive
```

### **Características Técnicas**
```yaml
Arquitectura: Microservicios
Comunicación: REST APIs
Estado: JWT + Local Storage
CORS: Configurado para desarrollo
Environment: Variables de entorno
```

### **Inteligencia Artificial**
```yaml
- Python 3.10  
- Scikit-Learn  
- Pandas / NumPy  
- Matplotlib / Seaborn 
```

## Arquitectura del Sistema

### **Microservicios**
- User Service (3001) 
- Mood Service (3002)
- Daily Records Service (3003)
- Exercises Service (3004)

### **Flujo de Datos**
- **Autenticación** → User Service
- **Datos de Salud** → Google Fit → Daily Service
- **Estado de Ánimo** → Mood Service → Daily Service
- **Predicción** → Daily Service (Stress Predictor)
- **Ejercicios** → Exercises Service
- **Recomendaciones** → Recommendation Engine

### **Base de Datos**
 
```javascript
// Esquemas principales - colecciones

User: {
  name, email, password_hash, role, settings,
  integrations: [google_fit, apple_health],
  notification_tokens, created_at
}

MoodEntry: {
  user_id, date, mood_score, note, tags, created_at
}

DailyRecord: {
  user_id, date, wellbeing: {sleep_hours, steps, source},
  stress_prediction: {score, level, factors, confidence},
  recommendations: [], alerts: [], sessions: [], mood_entries: []
}

Exercise: {
  slug, title, category, duration_seconds,
  content: {steps, video_url, audio_url, youtube_id},
  active, tags, created_at
}
```

## Instalación y Configuración

### **Prerrequisitos**
```bash
Node.js 16+ instalado
MongoDB local o en la nube
Git para clonar el repositorio
```

### **1. Clonar el Repositorio**
```bash
git clone https://github.com/maria-clavijo/proyecto-harmonia-app.git
cd proyecto-harmonia-app
```

### **2. Configuración del Backend**
```bash
# Navegar al directorio backend
cd harmonia_backend

# Instalar dependencias
npm install
```

### Configurar variables de entorno
Crea un archivo llamado `.env` dentro de `harmonia_backend/` con el siguiente contenido:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/harmonia-app

# Services Ports
USER_SERVICE_PORT=3001
MOOD_SERVICE_PORT=3002
DAILY_SERVICE_PORT=3003
EXERCISES_SERVICE_PORT=3004

# Auth
JWT_SECRET=changeme

# App Mode
NODE_ENV=development
USE_GOOGLE_FIT_SIMULATION=true
```


### **3. Configuración del Frontend**
```bash
# Navegar al directorio frontend
cd ../harmonia_frontend

# El frontend no requiere instalación
```

### **4. Ejecutar la Aplicación**
```bash
# Terminal 1 - Backend (desde harmonia_backend)
npm start

# o usar
npm run dev

# Terminal 2 - Servir Frontend (desde harmonia_frontend)
# Opción 1: Usar Live Server en VS Code
# Opción 2: Python simple HTTP server
python -m http.server 8000
```

### **5. Acceder a la Aplicación**
```text
Frontend: http://localhost:8000
API Health: http://localhost:3001/health
```

## Uso de la Aplicación

### **Primeros Pasos**
1. **Registro**: Crea tu cuenta con nombre, email, contraseña y país
2. **Configuración Automática**: Se conecta Google Fit en modo simulación
3. **Check-in**: Registra tu primer estado de ánimo

### **Dashboard Principal**
- **Tarjeta de Estrés**: Nivel actual de estrés con factores explicativos
- **Estadísticas**: Sueño, pasos, ejercicios completados
- **Recomendaciones**: Ejercicios sugeridos basados en tu estado
- **Alertas**: Notificaciones importantes sobre tu bienestar


## Desarrollo

### **Estructura del Proyecto**
```text
harmonia/
├── backend/
│   ├── shared/                 # Middlewares, autenticación y DB
│   ├── user-service/           # Servicio de usuarios (3001)
│   ├── mood-service/           # Servicio de estados de ánimo (3002)
│   ├── daily-records-service/  # Registros diarios + IA (3003)
│   ├── exercises-service/      # Ejercicios y contenido (3004)
│   ├── models_ml/              # Modelos de IA entrenados en Python
│   ├── generated-historical-data.js
│   └── package.json
│
├── frontend/
│   ├── index.html
│   ├── script.js
│   └── styles.css
│
├── notebooks/
│   └── stress_model_harmonia.ipynb
│
└── README.md
```

### **Generación de Datos de Prueba**
```bash
cd harmonia_backend
// Ejecutar para añadir datos históricos a la base de datos
node generated-historical-data.js

// Esto creará:
// - 2 meses de datos históricos
// - Entradas de ánimo realistas
// - Datos de sueño y actividad simulados
// - Predicciones de estrés generadas
```

## API Documentation

Cada microservicio expone rutas independientes para gestionar usuarios, estados de ánimo, registros diarios y ejercicios.

### Endpoints Principales

### **Autenticación**
```http
POST /auth/signup
POST /auth/login
```

### **Usuario**
```http
GET    /users/me
PATCH  /users/me
POST   /users/me/google-fit/connect
POST   /users/me/google-fit/sync
POST   /users/me/google-fit/disconnect
```

### **Estados de Ánimo**
```http
POST   /mood
GET    /mood
GET    /mood/stats
PATCH  /mood/:id
DELETE /mood/:id
```

### **Registros Diarios**
```http
POST   /daily/wellbeing/sync
GET    /daily/wellbeing/today
POST   /daily/stress/predict
GET    /daily/stress/today
GET    /daily/summary/weekly
POST   /daily/mood
```

### **Ejercicios**
```http
GET    /exercises
GET    /exercises/:id
POST   /exercises (admin)
PATCH  /exercises/:id (admin)
DELETE /exercises/:id (admin)
```
