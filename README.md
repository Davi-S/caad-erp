# CAAD ERP - Frontend Consumer

This repository contains the React frontend application for the CAAD ERP system.
It is currently in active development and primarily features a Point of Sale
(POS) wizard as a proof of concept.

The frontend is designed to consume the CAAD ERP FastAPI backend, providing a
streamlined, user-friendly interface for processing sales and managing
inventory.

## Current Features (Proof of Concept)

The current implementation focuses on a three-step POS checkout flow:

- **Seller Selection:** A starting screen that lists all active salespeople
  retrieved from the backend, requiring the user to select who is conducting the
  sale before proceeding.

- **Interactive Cart:** A point-of-sale interface where users can tap to add
  products, increment or decrement quantities, and view real-time totals.

- **Multi-Method Payment:** A dedicated payment screen that handles order
  confirmation.

- **API Integration:** Upon payment confirmation, the cart state is transformed
  into individual sales requests and submitted to the backend API, updating the
  centralized Excel data store.

## Development Setup

To run this frontend locally, you must have the CAAD ERP backend API running on
your local network.

1. Ensure the CAAD ERP API server is running (defaults to
   `[http://0.0.0.0:8000](http://0.0.0.0:8000)`).

2. Install the frontend dependencies using your preferred package manager (e.g.,
   `npm install`).
3. Start the local development server (e.g., `npm run dev`).
4. The application will initialize by fetching the product catalog, seller list,
   and current stock map. If the backend is unavailable, an error screen will
   prompt you to retry.

