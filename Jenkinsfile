pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }

  environment {
    DEPLOY_HOST = '172.17.0.1'
    DEPLOY_USER = 'root'
    DEPLOY_CREDENTIALS = 'deva-vps-ssh'
    APP_DIR = '/opt/deva'
    DEPLOY_DIR = '/opt/deva/deploy'
    BRANCH = 'deploy'
    HEALTH_URL = 'https://deva-demo.duckdns.org'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Deploy') {
      steps {
        sshagent(credentials: [env.DEPLOY_CREDENTIALS]) {
          sh '''
            ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} "
              set -e
              cd ${APP_DIR}
              git fetch origin ${BRANCH}
              git checkout ${BRANCH}
              git pull --ff-only origin ${BRANCH}
              cd ${DEPLOY_DIR}
              docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
            "
          '''
        }
      }
    }

    stage('Health check') {
      steps {
        sh '''
          for attempt in $(seq 1 24); do
            if curl -fsS ${HEALTH_URL} >/dev/null; then
              status="$(curl -sS -o /dev/null -w "%{http_code}" ${HEALTH_URL}/api/auth/me)"
              if [ "$status" = "401" ]; then
                echo "Health check passed on attempt ${attempt}."
                exit 0
              fi
              echo "Frontend is up but API returned HTTP ${status}; retrying..."
            else
              echo "Application is not ready yet; retrying..."
            fi
            sleep 5
          done

          echo "Health check failed after waiting for the application to become ready."
          exit 1
        '''
      }
    }
  }

  post {
    success {
      echo 'DEVA deployment completed successfully.'
    }
    failure {
      echo 'DEVA deployment failed. Check the Jenkins console output.'
    }
  }
}
