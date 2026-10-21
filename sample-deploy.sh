#!/bin/bash
# Sample script for testing the CloudPilot import feature.
# It is only read as text, never executed.

npm install
npm run build
npm test
npm audit
kubectl apply -f deployment.yaml
curl http://localhost:3000/health
