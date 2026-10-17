#!/bin/sh
# Run ./start.sh to start Tavoryn Terminal.
cd "$(dirname "$0")" && node server.js --open
