import { Panel } from './Panel';
import type { CVE } from '@/services/cyber/cve';
import { fetchCVEs, getSeverityColor, formatCvssScore } from '@/services/cyber/cve';
import { t } from '@/services/i18n';
import { escapeHtml } from '@/utils/sanitize';
import { startSmartPollLoop, type SmartPollLoopHandle } from '@/services/runtime';

type TabId = 'critical' | 'recent' | 'stats';
type SeverityFilter = 'all' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export class CVEPanel extends Panel {
  private cves: CVE[] = [];
  private filteredCves: CVE[] = [];
  private activeTab: TabId = 'critical';
  private severityFilter: SeverityFilter = 'all';
  private searchKeyword: string = '';
  private lastUpdate: Date | null = null;
  private pollHandle: SmartPollLoopHandle | null = null;

  constructor() {
    super({
      id: 'cve-feed',
      title: t('panels.cveFeed'),
      showCount: true,
      infoTooltip: t('components.cve.infoTooltip'),
    });

    this.content.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const tab = target.closest('.panel-tab') as HTMLElement | null;
      if (tab?.dataset.tab) {
        this.activeTab = tab.dataset.tab as TabId;
        this.applyFilters();
        this.render();
        return;
      }

      const filterBtn = target.closest('.cve-severity-filter') as HTMLElement | null;
      if (filterBtn?.dataset.severity) {
        this.severityFilter = filterBtn.dataset.severity as SeverityFilter;
        this.applyFilters();
        this.render();
        return;
      }

      const cveRow = target.closest('.cve-row') as HTMLElement | null;
      if (cveRow?.dataset.cve) {
        window.open(`https://nvd.nist.gov/vuln/detail/${cveRow.dataset.cve}`, '_blank');
        return;
      }
    });

    this.content.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.classList.contains('cve-search-input')) {
        this.searchKeyword = target.value.toLowerCase();
        this.applyFilters();
        this.render();
      }
    });

    this.showLoading();
  }

  public async refresh(): Promise<void> {
    if (this.isFetching) return;
    this.setFetching(true);
    this.setRetryCallback(() => void this.refresh());

    try {
      const resp = await fetchCVEs({ days: 7, pageSize: 100 });
      this.cves = resp.cves;
      this.applyFilters();
      this.lastUpdate = new Date();
      this.setCount(this.filteredCves.length);
      this.resetRetryBackoff();
      this.render();
    } catch (error) {
      if (this.isAbortError(error)) return;
      console.error('[CVEPanel] Failed to fetch CVEs:', error);
      if (this.cves.length === 0) {
        this.showError(t('components.cve.fetchError'), () => void this.refresh());
      }
    } finally {
      this.setFetching(false);
    }
  }

  public startPolling(intervalMs = 15 * 60 * 1000): void {
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

  private applyFilters(): void {
    let filtered = this.cves;

    if (this.activeTab === 'critical') {
      filtered = filtered.filter(c => c.severity === 'CRITICAL' || c.cvssScore >= 9.0);
    }

    if (this.severityFilter !== 'all') {
      filtered = filtered.filter(c => c.severity === this.severityFilter);
    }

    if (this.searchKeyword) {
      filtered = filtered.filter(c =>
        c.id.toLowerCase().includes(this.searchKeyword) ||
        c.description.toLowerCase().includes(this.searchKeyword) ||
        c.vendor.toLowerCase().includes(this.searchKeyword) ||
        c.product.toLowerCase().includes(this.searchKeyword)
      );
    }

    if (this.activeTab === 'recent') {
      filtered = [...filtered].sort((a, b) => b.publishedAt - a.publishedAt);
    } else {
      filtered = [...filtered].sort((a, b) => b.cvssScore - a.cvssScore);
    }

    this.filteredCves = filtered;
    this.setCount(filtered.length);
  }

  private render(): void {
    const tabsHtml = `
      <div class="panel-tabs">
        <button class="panel-tab ${this.activeTab === 'critical' ? 'active' : ''}" data-tab="critical">
          🔴 ${t('components.cve.tabs.critical')}
        </button>
        <button class="panel-tab ${this.activeTab === 'recent' ? 'active' : ''}" data-tab="recent">
          🕐 ${t('components.cve.tabs.recent')}
        </button>
        <button class="panel-tab ${this.activeTab === 'stats' ? 'active' : ''}" data-tab="stats">
          📊 ${t('components.cve.tabs.stats')}
        </button>
      </div>
    `;

    let contentHtml = '';
    switch (this.activeTab) {
      case 'critical':
      case 'recent':
        contentHtml = this.renderCveList();
        break;
      case 'stats':
        contentHtml = this.renderStats();
        break;
    }

    const updateTime = this.lastUpdate
      ? this.lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    this.setContent(`
      ${tabsHtml}
      <div class="cve-content">
        ${contentHtml}
      </div>
      <div class="cve-footer">
        <span class="cve-source">NVD/NIST</span>
        <span class="cve-update-time">${updateTime}</span>
      </div>
    `);
  }

  private renderCveList(): string {
    const searchHtml = `
      <div class="cve-search">
        <input type="text" class="cve-search-input" placeholder="${t('components.cve.searchPlaceholder')}" value="${escapeHtml(this.searchKeyword)}">
      </div>
    `;

    const filtersHtml = `
      <div class="cve-filters">
        ${(['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as SeverityFilter[]).map(sev => `
          <button class="cve-severity-filter ${this.severityFilter === sev ? 'active' : ''}" 
                  data-severity="${sev}"
                  ${sev !== 'all' ? `style="border-color: ${getSeverityColor(sev)}"` : ''}>
            ${sev === 'all' ? t('common.all') : sev}
          </button>
        `).join('')}
      </div>
    `;

    if (this.filteredCves.length === 0) {
      return `
        ${searchHtml}
        ${filtersHtml}
        <div class="cve-empty">${t('components.cve.noCves')}</div>
      `;
    }

    const cvesHtml = this.filteredCves.slice(0, 30).map(cve => this.renderCveRow(cve)).join('');

    return `
      ${searchHtml}
      ${filtersHtml}
      <div class="cve-list">
        ${cvesHtml}
      </div>
      ${this.filteredCves.length > 30 ? `
        <div class="cve-more">+${this.filteredCves.length - 30} ${t('components.cve.moreCves')}</div>
      ` : ''}
    `;
  }

  private renderCveRow(cve: CVE): string {
    const severityColor = getSeverityColor(cve.severity);
    const timeAgo = this.formatTimeAgo(new Date(cve.publishedAt));

    return `
      <div class="cve-row" data-cve="${escapeHtml(cve.id)}">
        <div class="cve-score" style="background: ${severityColor}">
          ${formatCvssScore(cve.cvssScore)}
        </div>
        <div class="cve-main">
          <div class="cve-header">
            <span class="cve-id">${escapeHtml(cve.id)}</span>
            <span class="cve-severity" style="color: ${severityColor}">${cve.severity}</span>
            ${cve.inKev ? `<span class="cve-kev-badge">KEV</span>` : ''}
          </div>
          <div class="cve-description">${escapeHtml(cve.description.substring(0, 150))}${cve.description.length > 150 ? '...' : ''}</div>
          <div class="cve-meta">
            ${cve.vendor ? `<span class="cve-vendor">${escapeHtml(cve.vendor)}</span>` : ''}
            ${cve.product ? `<span class="cve-product">${escapeHtml(cve.product)}</span>` : ''}
            <span class="cve-time">${timeAgo}</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderStats(): string {
    if (this.cves.length === 0) {
      return `<div class="cve-empty">${t('components.cve.noCves')}</div>`;
    }

    const bySeverity = this.countBy(this.cves, c => c.severity);
    const byVendor = this.countBy(this.cves.filter(c => c.vendor), c => c.vendor);
    const topVendors = Object.entries(byVendor).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const criticalCount = bySeverity['CRITICAL'] || 0;
    const highCount = bySeverity['HIGH'] || 0;
    const avgScore = this.cves.reduce((sum, c) => sum + c.cvssScore, 0) / this.cves.length;

    return `
      <div class="cve-stats">
        <div class="cve-stat-header">
          <div class="cve-stat-summary">
            <div class="cve-stat-box">
              <span class="cve-stat-number" style="color: var(--semantic-critical)">${criticalCount}</span>
              <span class="cve-stat-label">${t('components.cve.critical')}</span>
            </div>
            <div class="cve-stat-box">
              <span class="cve-stat-number" style="color: var(--semantic-high)">${highCount}</span>
              <span class="cve-stat-label">${t('components.cve.high')}</span>
            </div>
            <div class="cve-stat-box">
              <span class="cve-stat-number">${this.cves.length}</span>
              <span class="cve-stat-label">${t('components.cve.total')}</span>
            </div>
            <div class="cve-stat-box">
              <span class="cve-stat-number">${avgScore.toFixed(1)}</span>
              <span class="cve-stat-label">${t('components.cve.avgCvss')}</span>
            </div>
          </div>
        </div>

        <div class="cve-stat-section">
          <h4>${t('components.cve.bySeverity')}</h4>
          <div class="cve-severity-chart">
            ${(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(sev => `
              <div class="cve-severity-bar">
                <span class="cve-severity-label" style="color: ${getSeverityColor(sev)}">${sev}</span>
                <div class="cve-bar-track">
                  <div class="cve-bar-fill" style="width: ${((bySeverity[sev] || 0) / this.cves.length) * 100}%; background: ${getSeverityColor(sev)}"></div>
                </div>
                <span class="cve-severity-count">${bySeverity[sev] || 0}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="cve-stat-section">
          <h4>${t('components.cve.topVendors')}</h4>
          <div class="cve-vendor-list">
            ${topVendors.map(([vendor, count]) => `
              <div class="cve-vendor-row">
                <span class="cve-vendor-name">${escapeHtml(vendor)}</span>
                <span class="cve-vendor-count">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
    return items.reduce((acc, item) => {
      const key = keyFn(item);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
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
