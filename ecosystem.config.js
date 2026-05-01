module.exports = {
  apps: [
    {
      name: 'kleos-backend',
      script: './backend/dist/index.js',
      cwd: '/home/emir/AI-based-Intake-and-Email-Integration-with-Kleos-API-delivery',
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5433/kleos_intake?schema=public',
        DB_HOST: '127.0.0.1',
        DB_PORT: 5433,
        DB_NAME: 'kleos_intake',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        FRONTEND_URL: 'http://152.53.139.177:3003',
        UPLOAD_DIR: './backend/uploads',
        LOG_FILE: './backend/logs/app.log',
        LOG_LEVEL: 'info',
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      error_file: '/home/emir/.pm2/logs/kleos-backend-error.log',
      out_file: '/home/emir/.pm2/logs/kleos-backend-out.log',
    },
    {
      name: 'kleos-frontend',
      script: './frontend/server.js',
      cwd: '/home/emir/AI-based-Intake-and-Email-Integration-with-Kleos-API-delivery',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      error_file: '/home/emir/.pm2/logs/kleos-frontend-error.log',
      out_file: '/home/emir/.pm2/logs/kleos-frontend-out.log',
    }
  ]
};
