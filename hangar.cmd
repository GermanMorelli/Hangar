@echo off
rem Starts Hangar (if needed) and opens it as an app window.
cd /d "%~dp0"
start "Hangar" /min node launch.js
