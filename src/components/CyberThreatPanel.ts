import { Panel } from './Panel';
import type { CyberThreat, CyberThreatType, CyberThreatSource, CyberThreatSeverity } from '@/types';
import { fetchCyberThreats } from '@/services/cyber';
import { t } from '@/services/i18n';
import { escapeHtml } from '@/utils/sanitize';
import { getCSSColor } from '@/utils';
import { startSmartPollLoop, type SmartPollLoopHandle } from '@/services/runtime';

type TabId = 'threats' | 'stats' | 'activity';
type FilterType = 'all' | CyberThreatType;
type FilterSeverity = 'all' | CyberThreatSeverity;

export class CyberThreatPanel extends Panel {
  private threats: CyberThreat[] = [];
  private filteredThreats: CyberThreat[] = [];
  private activeTab: TabId = 'threats';
  private filterType: FilterType = 'all';
  private filterSeverity: FilterSeverity = 'all';
  private filterSource: 'all' | CyberThreatSource = 'all';
  private lastUpdate: Date | null = null;
  private pollHandle: SmartPollLoopHandle | null = null;
  private onMapLayerToggle?: (enabled: boolean) => void;

  constructor() {
    super({
      id: 'cyber-threats',
      title: t('panels.cyberThreats'),
      showCount: true,
      infoTooltip: t('components.cyberThreats.infoTooltip'),
    });

    this.content.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const tab = target.closest('.panel-tab') as HTMLElement | null;
      if (tab?.dataset.tab) {
        this.activeTab = tab.dataset.tab as TabId;
        this.render();
        return;
      }

      const copyBtn = target.closest('.cyber-copy-btn') as HTMLElement | null;
      if (copyBtn?.dataset.indicator) {
        this.copyToClipboard(copyBtn.dataset.indicator);
        return;
      }

      const filterBtn = target.closest('.cyber-filter-btn') as HTMLElement | null;
      if (filterBtn?.dataset.filter && filterBtn?.dataset.value) {
        this.applyFilter(filterBtn.dataset.filter, filterBtn.dataset.value);
        return;
      }

      const mapToggle = target.closest('.cyber-map-toggle') as HTMLElement | null;
      if (mapToggle) {
        this.onMapLayerToggle?.(true);
        return;
      }
    });

    this.showLoading();
  }

  public setMapLayerToggleHandler(handler: (enabled: boolean) => void): void {
    this.onMapLayerToggle = handler;
  }

  public async refresh(): Promise<void> {
    if (this.isFetching) return;
    this.setFetching(true);
    this.setRetryCallback(() => void this.refresh());

    try {
      const threats = await fetchCyberThreats({ limit: 500, days: 14 });
      this.threats = threats;
      this.applyFilters();
      this.lastUpdate = new Date();
      this.setCount(this.filteredThreats.length);
      this.resetRetryBackoff();
      this.render();
    } catch (error) {
      if (this.isAbortError(error)) return;
      console.error('[CyberThreatPanel] Failed to fetch threats:', error);
      if (this.threats.length === 0) {
        this.showError(t('components.cyberThreats.fetchError'), () => void this.refresh());
      }
    } finally {
      this.setFetching(false);
    }
  }

  public startPolling(intervalMs = 5 * 60 * 1000): void {
    this.stopPolling();
    this.pollHandle = startSmartPollLoop(
      async () => { await this.refresh(); },
      { intervalMs, refreshOnVisible: true },
    );
  }

  public stopPolling(): void {
    this.pollHandle?.stop();
    this.pollHandle = null;
  }

  private applyFilter(filter: string, value: string): void {
    switch (filter) {
      case 'type':
        this.filterType = value as FilterType;
        break;
      case 'severity':
        this.filterSeverity = value as FilterSeverity;
        break;
      case 'source':
        this.filterSource = value as 'all' | CyberThreatSource;
        break;
    }
    this.applyFilters();
    this.render();
  }

  private applyFilters(): void {
    let filtered = this.threats;

    if (this.filterType !== 'all') {
      filtered = filtered.filter(t => t.type === this.filterType);
    }
    if (this.filterSeverity !== 'all') {
      filtered = filtered.filter(t => t.severity === this.filterSeverity);
    }
    if (this.filterSource !== 'all') {
      filtered = filtered.filter(t => t.source === this.filterSource);
    }

    this.filteredThreats = filtered;
    this.setCount(filtered.length);
  }

  private copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      const btn = this.content.querySelector(`[data-indicator="${CSS.escape(text)}"]`);
      if (btn) {
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1500);
      }
    }).catch(console.error);
  }

  private getSeverityColor(severity: CyberThreatSeverity): string {
    switch (severity) {
      case 'critical': return getCSSColor('--semantic-critical');
      case 'high': return getCSSColor('--semantic-high');
      case 'medium': return getCSSColor('--semantic-elevated');
      case 'low': return getCSSColor('--semantic-normal');
    }
  }

  private getSeverityLabel(severity: CyberThreatSeverity): string {
    return t(`components.cyberThreats.severity.${severity}`);
  }

  private getTypeLabel(type: CyberThreatType): string {
    return t(`components.cyberThreats.type.${type}`);
  }

  private getTypeIcon(type: CyberThreatType): string {
    switch (type) {
      case 'c2_server': return '🖥️';
      case 'malware_host': return '🦠';
      case 'phishing': return '🎣';
      case 'malicious_url': return '🔗';
    }
  }

  private getSourceLabel(source: CyberThreatSource): string {
    switch (source) {
      case 'feodo': return 'Feodo';
      case 'urlhaus': return 'URLhaus';
      case 'c2intel': return 'C2Intel';
      case 'otx': return 'OTX';
      case 'abuseipdb': return 'AbuseIPDB';
    }
  }

  private render(): void {
    const tabsHtml = `
      <div class="panel-tabs">
        <button class="panel-tab ${this.activeTab === 'threats' ? 'active' : ''}" data-tab="threats">
          🎯 ${t('components.cyberThreats.tabs.threats')}
        </button>
        <button class="panel-tab ${this.activeTab === 'stats' ? 'active' : ''}" data-tab="stats">
          📊 ${t('components.cyberThreats.tabs.stats')}
        </button>
        <button class="panel-tab ${this.activeTab === 'activity' ? 'active' : ''}" data-tab="activity">
          ⏱️ ${t('components.cyberThreats.tabs.activity')}
        </button>
      </div>
    `;

    let contentHtml = '';
    switch (this.activeTab) {
      case 'threats':
        contentHtml = this.renderThreats();
        break;
      case 'stats':
        contentHtml = this.renderStats();
        break;
      case 'activity':
        contentHtml = this.renderActivity();
        break;
    }

    const updateTime = this.lastUpdate
      ? this.lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    this.setContent(`
      ${tabsHtml}
      <div class="cyber-threats-content">
        ${contentHtml}
      </div>
      <div class="cyber-threats-footer">
        <button class="cyber-map-toggle" title="${t('components.cyberThreats.showOnMap')}">
          🗺️ ${t('components.cyberThreats.showOnMap')}
        </button>
        <span class="cyber-update-time">${updateTime}</span>
      </div>
    `);
  }

  private renderThreats(): string {
    if (this.threats.length === 0) {
      return `<div class="cyber-empty">${t('components.cyberThreats.noThreats')}</div>`;
    }

    const filtersHtml = this.renderFilters();
    const threatsHtml = this.filteredThreats.slice(0, 50).map(threat => this.renderThreatRow(threat)).join('');

    return `
      ${filtersHtml}
      <div class="cyber-threats-list">
        ${threatsHtml}
      </div>
      ${this.filteredThreats.length > 50 ? `
        <div class="cyber-more">${t('components.cyberThreats.andMore', { count: this.filteredThreats.length - 50 })}</div>
      ` : ''}
    `;
  }

  private renderFilters(): string {
    const types: FilterType[] = ['all', 'c2_server', 'malware_host', 'phishing', 'malicious_url'];
    const severities: FilterSeverity[] = ['all', 'critical', 'high', 'medium', 'low'];

    return `
      <div class="cyber-filters">
        <div class="cyber-filter-group">
          <label>${t('components.cyberThreats.filterType')}:</label>
          <div class="cyber-filter-buttons">
            ${types.map(type => `
              <button class="cyber-filter-btn ${this.filterType === type ? 'active' : ''}" 
                      data-filter="type" data-value="${type}">
                ${type === 'all' ? t('common.all') : this.getTypeLabel(type as CyberThreatType)}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="cyber-filter-group">
          <label>${t('components.cyberThreats.filterSeverity')}:</label>
          <div class="cyber-filter-buttons">
            ${severities.map(sev => `
              <button class="cyber-filter-btn ${this.filterSeverity === sev ? 'active' : ''}"
                      data-filter="severity" data-value="${sev}"
                      ${sev !== 'all' ? `style="border-color: ${this.getSeverityColor(sev as CyberThreatSeverity)}"` : ''}>
                ${sev === 'all' ? t('common.all') : this.getSeverityLabel(sev as CyberThreatSeverity)}
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private renderThreatRow(threat: CyberThreat): string {
    const severityColor = this.getSeverityColor(threat.severity);
    const icon = this.getTypeIcon(threat.type);
    const typeLabel = this.getTypeLabel(threat.type);
    const lastSeen = threat.lastSeen ? this.formatTimeAgo(new Date(threat.lastSeen)) : '';

    return `
      <div class="cyber-threat-row" data-severity="${threat.severity}">
        <div class="cyber-threat-icon" title="${escapeHtml(typeLabel)}">${icon}</div>
        <div class="cyber-threat-main">
          <div class="cyber-threat-indicator">
            <code>${escapeHtml(threat.indicator)}</code>
            <button class="cyber-copy-btn" data-indicator="${escapeHtml(threat.indicator)}" title="${t('common.copy')}">
              📋
            </button>
          </div>
          <div class="cyber-threat-meta">
            <span class="cyber-severity-badge" style="background: ${severityColor}">
              ${this.getSeverityLabel(threat.severity)}
            </span>
            <span class="cyber-source">${this.getSourceLabel(threat.source)}</span>
            ${threat.country ? `<span class="cyber-country">📍 ${escapeHtml(threat.country)}</span>` : ''}
            ${threat.malwareFamily ? `<span class="cyber-malware">🦠 ${escapeHtml(threat.malwareFamily)}</span>` : ''}
            ${lastSeen ? `<span class="cyber-time">${lastSeen}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  private renderStats(): string {
    if (this.threats.length === 0) {
      return `<div class="cyber-empty">${t('components.cyberThreats.noThreats')}</div>`;
    }

    const byType = this.countBy(this.threats, t => t.type);
    const bySeverity = this.countBy(this.threats, t => t.severity);
    const bySource = this.countBy(this.threats, t => t.source);
    const byCountry = this.countBy(this.threats.filter(t => t.country), t => t.country!);
    const topCountries = Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return `
      <div class="cyber-stats">
        <div class="cyber-stat-section">
          <h4>${t('components.cyberThreats.byType')}</h4>
          <div class="cyber-stat-bars">
            ${Object.entries(byType).map(([type, count]) => `
              <div class="cyber-stat-row">
                <span class="cyber-stat-label">${this.getTypeIcon(type as CyberThreatType)} ${this.getTypeLabel(type as CyberThreatType)}</span>
                <div class="cyber-stat-bar">
                  <div class="cyber-stat-fill" style="width: ${(count / this.threats.length) * 100}%"></div>
                </div>
                <span class="cyber-stat-count">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="cyber-stat-section">
          <h4>${t('components.cyberThreats.bySeverity')}</h4>
          <div class="cyber-stat-bars">
            ${(['critical', 'high', 'medium', 'low'] as CyberThreatSeverity[]).map(sev => `
              <div class="cyber-stat-row">
                <span class="cyber-stat-label" style="color: ${this.getSeverityColor(sev)}">${this.getSeverityLabel(sev)}</span>
                <div class="cyber-stat-bar">
                  <div class="cyber-stat-fill" style="width: ${((bySeverity[sev] || 0) / this.threats.length) * 100}%; background: ${this.getSeverityColor(sev)}"></div>
                </div>
                <span class="cyber-stat-count">${bySeverity[sev] || 0}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="cyber-stat-section">
          <h4>${t('components.cyberThreats.bySource')}</h4>
          <div class="cyber-stat-bars">
            ${Object.entries(bySource).map(([source, count]) => `
              <div class="cyber-stat-row">
                <span class="cyber-stat-label">${this.getSourceLabel(source as CyberThreatSource)}</span>
                <div class="cyber-stat-bar">
                  <div class="cyber-stat-fill" style="width: ${(count / this.threats.length) * 100}%"></div>
                </div>
                <span class="cyber-stat-count">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="cyber-stat-section">
          <h4>${t('components.cyberThreats.topCountries')}</h4>
          <div class="cyber-stat-bars">
            ${topCountries.map(([country, count]) => `
              <div class="cyber-stat-row">
                <span class="cyber-stat-label">${escapeHtml(country)}</span>
                <div class="cyber-stat-bar">
                  <div class="cyber-stat-fill" style="width: ${(count / this.threats.length) * 100}%"></div>
                </div>
                <span class="cyber-stat-count">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private renderActivity(): string {
    if (this.threats.length === 0) {
      return `<div class="cyber-empty">${t('components.cyberThreats.noThreats')}</div>`;
    }

    const recentThreats = this.threats
      .filter(t => t.lastSeen)
      .sort((a, b) => new Date(b.lastSeen!).getTime() - new Date(a.lastSeen!).getTime())
      .slice(0, 20);

    const grouped = this.groupByHour(recentThreats);

    return `
      <div class="cyber-activity">
        <div class="cyber-activity-header">
          <span>${t('components.cyberThreats.recentActivity')}</span>
          <span class="cyber-activity-count">${this.threats.length} ${t('components.cyberThreats.totalThreats')}</span>
        </div>
        <div class="cyber-activity-timeline">
          ${Object.entries(grouped).map(([hour, threats]) => `
            <div class="cyber-activity-group">
              <div class="cyber-activity-hour">${hour}</div>
              <div class="cyber-activity-items">
                ${(threats as CyberThreat[]).map(threat => `
                  <div class="cyber-activity-item" style="border-left-color: ${this.getSeverityColor(threat.severity)}">
                    <span class="cyber-activity-icon">${this.getTypeIcon(threat.type)}</span>
                    <code class="cyber-activity-indicator">${escapeHtml(threat.indicator.length > 30 ? threat.indicator.substring(0, 30) + '...' : threat.indicator)}</code>
                    ${threat.country ? `<span class="cyber-activity-country">📍${escapeHtml(threat.country)}</span>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private countBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Record<K, number> {
    return items.reduce((acc, item) => {
      const key = keyFn(item);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<K, number>);
  }

  private groupByHour(threats: CyberThreat[]): Record<string, CyberThreat[]> {
    const groups: Record<string, CyberThreat[]> = {};
    for (const threat of threats) {
      if (!threat.lastSeen) continue;
      const date = new Date(threat.lastSeen);
      const hour = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (!groups[hour]) groups[hour] = [];
      groups[hour].push(threat);
    }
    return groups;
  }

  private formatTimeAgo(date: Date): string {
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return t('countryBrief.timeAgo.m', { count: diffMins });
    if (diffHours < 24) return t('countryBrief.timeAgo.h', { count: diffHours });
    return t('countryBrief.timeAgo.d', { count: diffDays });
  }

  public destroy(): void {
    this.stopPolling();
    super.destroy();
  }
}
