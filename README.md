Project Overview
Maidanja WiFi is a full-stack, production-ready WiFi hotspot management platform built with Node.js, Express, PostgreSQL, and vanilla HTML/CSS/Tailwind.

Core Features
MikroTik Automation (NEW): Automatically creates hotspot users, manages bandwidth per package (e.g., 5Mbps, 10Mbps), and auto-disconnects expired sessions. Includes a Simulation mode for testing.
M-Pesa Payments: STK Push integration via Safaricom's Daraja API for automated payments.
Session Management: Real-time tracking and auto-expiry of paid WiFi time.
Admin Dashboard: Real-time KPI monitoring, user management, and session control.
Quick Setup Guide
Prerequisites: Node.js (v18+) and PostgreSQL (v14+).
Install: Run npm install.
Environment: Copy .env.example to .env and configure your Database, JWT Secret, and M-Pesa credentials.
Database Setup:
bash
psql -U postgres -c "CREATE DATABASE maidanja_wifi;"
psql -U postgres -d maidanja_wifi -f database/schema.sql
psql -U postgres -d maidanja_wifi -f database/seed.sql
Run Server: Use npm run dev for local development.