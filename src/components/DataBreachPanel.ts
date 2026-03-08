import { Panel } from './Panel';
import type { DataBreach } from '@/services/cyber/breaches';
import { fetchBreaches, formatPwnCount, getDataClassIcon } from '@/services/cyber/breaches';
import { t } from '@/services/i18n';
import { escapeHtml } from '@/utils/sanitize';
import { startSmartPollLoop, type SmartPollLoopHandle } from '@/services/runtime';

type TabId = 'recent' | 'largest' | 'stats';

export class DataBreachPanel extends Panel {
  private breaches: DataBreach[] = [];
  private activeTab: TabId = 'recent';
  private lastUpdate: Date | null = null;
  private pollHandle: SmartPollLoopHandle | null = null;

  constructor() {
    super({
      id: 'data-breaches',
      title: t('panels.dataBreaches'),
      showCount: true,
      infoTooltip: t('components.breaches.infoTooltip'),
    });

    this.content.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const tab = target.closest('.panel-tab') as HTMLElement | null;
      if (tab?.dataset.tab) {
        this.activeTab = tab.dataset.tab as TabId;
        this.render();
        return;
      }

      const breachRow = target.closest('.breach-row') as HTMLElement | null;
      if (breachRow?.dataset.domain) {
        window.open(`https://haveibeenpwned.com/PwnedWebsites#${breachRow.dataset.name}`, '_blank');
        return;
      }
    });

    this.showLoading();
  }

  public async refresh(): Promise<void> {
    if (this.isFetching) return;
    this.setFetching(true);
    this.setRetryCallback(() => void this.refresh());

    try {
      const resp = await fetchBreaches({ days: 365, pageSize: 100 });
      this.breaches = resp.breaches;
      this.lastUpdate = new Date();
      this.setCount(this.breaches.length);
      this.resetRetryBackoff();
      this.render();
    } catch (error) {
      if (this.isAbortError(error)) return;
      console.error('[DataBreachPanel] Failed to fetch breaches:', error);
      if (this.breaches.length === 0) {
        this.showError(t('components.breaches.fetchError'), () => void this.refresh());
      }
    } finally {
      this.setFetching(false);
    }
  }

  public startPolling(intervalMs = 30 * 60 * 1000): void {
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

  private render(): void {
    const tabsHtml = `
      <div class="panel-tabs">
        <button class="panel-tab ${this.activeTab === 'recent' ? 'active' : ''}" data-tab="recent">
          🕐 ${t('components.breaches.tabs.recent')}
        </button>
        <button class="panel-tab ${this.activeTab === 'largest' ? 'active' : ''}" data-tab="largest">
          📊 ${t('components.breaches.tabs.largest')}
        </button>
        <button class="panel-tab ${this.activeTab === 'stats' ? 'active' : ''}" data-tab="stats">
          📈 ${t('components.breaches.tabs.stats')}
        </button>
      </div>
    `;

    let contentHtml = '';
    switch (this.activeTab) {
      case 'recent':
        contentHtml = this.renderRecent();
        break;
      case 'largest':
        contentHtml = this.renderLargest();
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
      <div class="breach-content">
        ${contentHtml}
      </div>
      <div class="breach-footer">
        <span class="breach-source">Have I Been Pwned</span>
        <span class="breach-update-time">${updateTime}</span>
      </div>
    `);
  }

  private renderRecent(): string {
    if (this.breaches.length === 0) {
      return `<div class="breach-empty">${t('components.breaches.noBreaches')}</div>`;
    }

    const sortedBreaches = [...this.breaches].sort((a, b) => b.addedDate - a.addedDate);
    const breachesHtml = sortedBreaches.slice(0, 25).map(breach => this.renderBreachRow(breach)).join('');

    return `
      <div class="breach-list">
        ${breachesHtml}
      </div>
    `;
  }

  private renderLargest(): string {
    if (this.breaches.length === 0) {
      return `<div class="breach-empty">${t('components.breaches.noBreaches')}</div>`;
    }

    const sortedBreaches = [...this.breaches].sort((a, b) => b.pwnCount - a.pwnCount);
    const breachesHtml = sortedBreaches.slice(0, 25).map(breach => this.renderBreachRow(breach)).join('');

    return `
      <div class="breach-list">
        ${breachesHtml}
      </div>
    `;
  }

  private renderBreachRow(breach: DataBreach): string {
    const breachDate = new Date(breach.breachDate).toLocaleDateString();
    const topDataClasses = breach.dataClasses.slice(0, 4);

    return `
      <div class="breach-row" data-name="${escapeHtml(breach.name)}" data-domain="${escapeHtml(breach.domain)}">
        <div class="breach-logo">
          ${breach.logoPath ? `<img src="https://haveibeenpwned.com${breach.logoPath}" alt="" onerror="this.style.display='none'">` : ''}
          <span class="breach-logo-fallback">🔐</span>
        </div>
        <div class="breach-main">
          <div class="breach-header">
            <span class="breach-title">${escapeHtml(breach.title)}</span>
            ${breach.isVerified ? `<span class="breach-verified" title="${t('components.breaches.verified')}">✓</span>` : ''}
          </div>
          <div class="breach-meta">
            <span class="breach-count">${formatPwnCount(breach.pwnCount)} ${t('components.breaches.accounts')}</span>
            <span class="breach-date">${breachDate}</span>
          </div>
          <div class="breach-data-classes">
            ${topDataClasses.map(dc => `<span class="breach-data-class">${getDataClassIcon(dc)} ${escapeHtml(dc)}</span>`).join('')}
            ${breach.dataClasses.length > 4 ? `<span class="breach-data-more">+${breach.dataClasses.length - 4}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  private renderStats(): string {
    if (this.breaches.length === 0) {
      return `<div class="breach-empty">${t('components.breaches.noBreaches')}</div>`;
    }

    const totalAccounts = this.breaches.reduce((sum, b) => sum + b.pwnCount, 0);
    const verifiedCount = this.breaches.filter(b => b.isVerified).length;

    const allDataClasses: Record<string, number> = {};
    for (const breach of this.breaches) {
      for (const dc of breach.dataClasses) {
        allDataClasses[dc] = (allDataClasses[dc] || 0) + 1;
      }
    }
    const topDataClasses = Object.entries(allDataClasses).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const byYear: Record<string, number> = {};
    for (const breach of this.breaches) {
      const year = new Date(breach.breachDate).getFullYear().toString();
      byYear[year] = (byYear[year] || 0) + 1;
    }
    const sortedYears = Object.entries(byYear).sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, 5);

    return `
      <div class="breach-stats">
        <div class="breach-stat-summary">
          <div class="breach-stat-box">
            <span class="breach-stat-number">${this.breaches.length}</span>
            <span class="breach-stat-label">${t('components.breaches.totalBreaches')}</span>
          </div>
          <div class="breach-stat-box">
            <span class="breach-stat-number">${formatPwnCount(totalAccounts)}</span>
            <span class="breach-stat-label">${t('components.breaches.totalAccounts')}</span>
          </div>
          <div class="breach-stat-box">
            <span class="breach-stat-number">${verifiedCount}</span>
            <span class="breach-stat-label">${t('components.breaches.verified')}</span>
          </div>
        </div>

        <div class="breach-stat-section">
          <h4>${t('components.breaches.dataTypes')}</h4>
          <div class="breach-data-types">
            ${topDataClasses.map(([dc, count]) => `
              <div class="breach-data-type-row">
                <span class="breach-data-type-icon">${getDataClassIcon(dc)}</span>
                <span class="breach-data-type-name">${escapeHtml(dc)}</span>
                <span class="breach-data-type-count">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="breach-stat-section">
          <h4>${t('components.breaches.byYear')}</h4>
          <div class="breach-years">
            ${sortedYears.map(([year, count]) => `
              <div class="breach-year-row">
                <span class="breach-year">${year}</span>
                <div class="breach-year-bar">
                  <div class="breach-year-fill" style="width: ${(count / Math.max(...sortedYears.map(y => y[1]))) * 100}%"></div>
                </div>
                <span class="breach-year-count">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  public destroy(): void {
    this.stopPolling();
    super.destroy();
  }
}
