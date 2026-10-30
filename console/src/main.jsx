import React from 'react';
import { createRoot } from 'react-dom/client';
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import App from './App.jsx';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles.css';

ModuleRegistry.registerModules([AllEnterpriseModule]);
if (import.meta.env.VITE_AG_GRID_LICENSE) LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE);

createRoot(document.getElementById('root')).render(<App />);
