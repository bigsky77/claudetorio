#!/bin/bash
cd /var/claudetorio/broker
source .venv/bin/activate
exec uvicorn main:app --host 0.0.0.0 --port 8080 --workers 4
