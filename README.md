# CAAD ERP - Frontend Consumer

This repository contains the React frontend application for the CAAD ERP system.
It is currently in active development and primarily features a Point of Sale
(POS) wizard as a proof of concept.

The frontend is designed to consume the CAAD ERP FastAPI backend, providing a
streamlined, user-friendly interface for processing sales and managing
inventory.

## Current Features

- **Home Page:** Direct oversight of all management pages and point of sale
  flow.
- **Point of Sale:** Main page to conduct a sale. Features a salesman selection
  screen, an interactive cart screen, and a payment screen that handles order
  confirmation.
- **Product Management:** Tools to add, edit, or remove items from the product
  catalog.
- **Salesmen Management:** An interface to register, update, and manage the
  active status of salespeople.
- **Stock Management:** Direct oversight and control over inventory levels.

## Future Features

The application will be expanded to include the following functionalities:

- Log Audit and Management: Capabilities to review historical actions, including
  the ability to void entries
- Reports Dashboard: A comprehensive view into the business metrics, allowing
  users to see profit margins, summaries, outstanding debts, and other key
  analytics.

## Development Setup

To run this frontend locally, you must have the CAAD ERP backend API running on
your local network.

1. Ensure the CAAD ERP API server is running (defaults to
   `[http://0.0.0.0:8000](http://0.0.0.0:8000)`).
2. Install the frontend dependencies using your preferred package manager (e.g.,
   `npm install`).
3. Start the local development server (e.g., `npm run dev`).

