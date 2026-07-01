const fs = require('fs');
const path = 'c:/Users/InternCY/Documents/GitHub/Demo_Honeypot/frontend/src/routes/dashboard/analytics/+page.svelte';
let content = fs.readFileSync(path, 'utf8');

// Replace main container
content = content.replace(/<div class="analytics-page">/g, '<div style="display:flex;flex-direction:column;gap:16px;padding-bottom:2rem;">');

// Replace tabs
content = content.replace(/<div class="tabs-bar">/g, '<div class="ds-filters">');
content = content.replace(/<button class="tab-btn \{activeTab === '([^']+)' \? 'active' : ''\}"/g, '<button class="ds-btn {activeTab === \'$1\' ? \'primary\' : \'\'}"');

// Replace panels
content = content.replace(/<div class="panel">/g, '<div class="ds-card" style="padding:0;overflow:hidden;">');
content = content.replace(/<div class="panel-head">/g, '<div class="ds-card-head" style="padding:16px;border-bottom:1px solid var(--border);">');
content = content.replace(/<div class="panel-title">/g, '<div class="ds-card-title">');

// Replace stat cards
content = content.replace(/<div class="stat-cards">/g, '<div class="ds-kpi-row" style="margin-bottom:0;">');
content = content.replace(/<div class="stat-card accent-green">/g, '<div class="ds-kpi"><div class="ds-kpi-icon" style="color:var(--green);background:var(--green-bg)">');
content = content.replace(/<div class="stat-card accent-blue">/g, '</div><div class="ds-kpi"><div class="ds-kpi-icon" style="color:var(--blue);background:var(--blue-bg)">');
content = content.replace(/<div class="stat-card accent-orange">/g, '</div><div class="ds-kpi"><div class="ds-kpi-icon" style="color:var(--orange);background:var(--orange-bg)">');
content = content.replace(/<div class="stat-card accent-red">/g, '</div><div class="ds-kpi"><div class="ds-kpi-icon" style="color:var(--red);background:var(--red-bg)">');
content = content.replace(/<div class="sc-icon">/g, '');
content = content.replace(/<\/div>\s*<div class="sc-body">/g, '</div><div class="ds-kpi-body">');
content = content.replace(/<div class="sc-val">/g, '<div class="ds-kpi-val">');
content = content.replace(/<div class="sc-lbl">/g, '<div class="ds-kpi-lbl">');

// Clean up some CSS
content = content.replace(/\.analytics-page \{ [^\}]+\}/g, '');
content = content.replace(/\.tabs-bar \{ [^\}]+\}/g, '');
content = content.replace(/\.tab-btn \{ [^\}]+\}/g, '');
content = content.replace(/\.tab-btn\.active \{ [^\}]+\}/g, '');
content = content.replace(/\.tab-btn:hover \{ [^\}]+\}/g, '');
content = content.replace(/\.panel \{ [^\}]+\}/g, '');
content = content.replace(/\.panel-head \{ [^\}]+\}/g, '');
content = content.replace(/\.panel-title \{ [^\}]+\}/g, '');

fs.writeFileSync(path, content, 'utf8');
console.log('Updated analytics');
