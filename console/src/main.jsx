import React from 'react';
import { createRoot } from 'react-dom/client';
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import App from './App.jsx';
import './styles.css';

ModuleRegistry.registerModules([AllEnterpriseModule]);
if (import.meta.env.VITE_AG_GRID_LICENSE) LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE);

createRoot(document.getElementById('root')).render(<App />);
