#!/usr/bin/env bash
gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
