import React from 'react';import {createRoot} from 'react-dom/client';import {HashRouter} from 'react-router-dom';import './t.css';import {TodayCards} from '../src/components/DashboardToday';
createRoot(document.getElementById('root')).render(<HashRouter><div className="mx-auto max-w-7xl p-4"><TodayCards/></div></HashRouter>);
