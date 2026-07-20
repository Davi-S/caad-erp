# CAAD ERP - Frontend Consumer

This repository contains the React frontend application for the CAAD ERP system.
It is currently in active development and primarily features a Point of Sale
(POS) wizard as a proof of concept.

The frontend is designed to consume the CAAD ERP FastAPI backend, providing a
streamlined, user-friendly interface for processing sales and managing
inventory.

## Tech Stack

- **Frontend Library**: The application is built using React.
- **State Management & Data Fetching**: Data fetching and caching are handled by
  React Query (@tanstack/react-query).
- **Routing**: Navigation and data pre-loading are managed by React Router
  (react-router-dom).
- **UI Components**: The interface is styled and built with Mantine UI.
- **Icons**: The application utilizes Lucide React for its iconography.
- **QR Code Generation**: Pix payments are facilitated by react-qrcode-pix.

## Current Features

The current implementation focuses on a three-step POS checkout flow:

- **Salesman Selection:** A starting screen that lists all active salespeople
  retrieved from the backend. It requires the user to select who is conducting
  the sale before proceeding.
- **Interactive Cart:** A point-of-sale interface where users can tap to add
  products, increment or decrement quantities, and view real-time totals. The
  cart visually indicates the remaining available units and disables the
  addition of out-of-stock items.
- **Multi-Method Payment:** A dedicated payment screen that handles order
  confirmation. It supports multiple payment methods including Pix, Cash,
  OnCredit, and Other. When Pix is selected, the application dynamically
  generates a QR Code for the transaction.
- **API Integration:** Upon payment confirmation, the cart state is transformed
  into individual sales requests and submitted to the backend API.

## Future Features

The application will be expanded to include the following functionalities:

- Product Management: Tools to add, edit, or remove items from the product
  catalog.
- Salesmen Management: An interface to register, update, and manage the active
  status of salespeople. Will also allow to see and pay debt entries.
- Stock Management: Direct oversight and control over inventory levels.
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

