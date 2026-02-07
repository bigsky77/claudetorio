#!/bin/bash
cd /var/claudetorio/broker
exec uv run uvicorn main:app --host 0.0.0.0 --port 8080 --workers 4
