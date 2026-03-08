import { Panel } from './Panel';
import type { RansomwareGroup, RansomwareVictim } from '@/services/cyber/ransomware';
import { fetchRansomwareGroups, fetchRansomwareVictims } from '@/services/cyber/ransomware';
import { t } from '@/services/i18n';
import { escapeHtml } from '@/utils/sanitize';
import { startSmartPollLoop, type SmartPollLoopHandle } from '@/services/runtime';

type TabId = 'groups' | 'victims' | 'stats';

export class RansomwarePanel extends Panel {
  private groups: RansomwareGroup[] = [];
  private victims: RansomwareVictim[] = [];
  private activeTab: TabId = 'victims';
  private selectedGroup: string = '';
  private lastUpdate: Date | null = null;
  private pollHandle: SmartPollLoopHandle | null = null;
  private onMapLayerToggle: ((enabled: boolean) => void) | null = null;

  constructor() {
    super({
      id: 'ransomware',
      title: t('panels.ransomware'),
      showCount: true,
      infoTooltip: t('components.ransomware.infoTooltip'),
    });

    this.content.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const tab = target.closest('.panel-tab') as HTMLElement | null;
      if (tab?.dataset.tab) {
        this.activeTab = tab.dataset.tab as TabId;
        this.render();
        return;
      }

      const groupRow = target.closest('.ransomware-group-row') as HTMLElement | null;
      if (groupRow?.dataset.group) {
        this.selectedGroup = groupRow.dataset.group;
        this.activeTab = 'victims';
        void this.refresh();
        return;
      }

      const clearFilter = target.closest('.ransomware-clear-filter') as HTMLElement | null;
      if (clearFilter) {
        this.selectedGroup = '';
        void this.refresh();
        return;
      }

      const mapToggle = target.closest('.ransomware-map-toggle') as HTMLElement | null;
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
      const [groupsResp, victimsResp] = await Promise.all([
        fetchRansomwareGroups({ pageSize: 100 }),
        fetchRansomwareVictims({ group: this.selectedGroup, days: 30, pageSize: 100 }),
      ]);

      this.groups = groupsResp.groups;
      this.victims = victimsResp.victims;
      this.lastUpdate = new Date();
      this.setCount(this.victims.length);
      this.resetRetryBackoff();
      this.render();
    } catch (error) {
      if (this.isAbortError(error)) return;
      console.error('[RansomwarePanel] Failed to fetch data:', error);
      if (this.victims.length === 0 && this.groups.length === 0) {
        this.showError(t('components.ransomware.fetchError'), () => void this.refresh());
      }
    } finally {
      this.setFetching(false);
    }
  }

  public startPolling(intervalMs = 10 * 60 * 1000): void {
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
        <button class="panel-tab ${this.activeTab === 'victims' ? 'active' : ''}" data-tab="victims">
          🎯 ${t('components.ransomware.tabs.victims')}
        </button>
        <button class="panel-tab ${this.activeTab === 'groups' ? 'active' : ''}" data-tab="groups">
          👥 ${t('components.ransomware.tabs.groups')}
        </button>
        <button class="panel-tab ${this.activeTab === 'stats' ? 'active' : ''}" data-tab="stats">
          📊 ${t('components.ransomware.tabs.stats')}
        </button>
      </div>
    `;

    let contentHtml = '';
    switch (this.activeTab) {
      case 'victims':
        contentHtml = this.renderVictims();
        break;
      case 'groups':
        contentHtml = this.renderGroups();
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
      <div class="ransomware-content">
        ${contentHtml}
      </div>
      <div class="ransomware-footer">
        <button class="ransomware-map-toggle cyber-map-toggle" title="${t('components.ransomware.showOnMap')}">
          🗺️ ${t('components.ransomware.showOnMap')}
        </button>
        <span class="ransomware-source">Ransomware.live</span>
        <span class="ransomware-update-time">${updateTime}</span>
      </div>
    `);
  }

  private renderVictims(): string {
    if (this.victims.length === 0) {
      return `<div class="ransomware-empty">${t('components.ransomware.noVictims')}</div>`;
    }

    const filterHtml = this.selectedGroup ? `
      <div class="ransomware-filter-active">
        <span>${t('components.ransomware.filteringBy')}: <strong>${escapeHtml(this.selectedGroup)}</strong></span>
        <button class="ransomware-clear-filter">${t('common.clear')}</button>
      </div>
    ` : '';

    const victimsHtml = this.victims.slice(0, 50).map(victim => this.renderVictimRow(victim)).join('');

    return `
      ${filterHtml}
      <div class="ransomware-victims-list">
        ${victimsHtml}
      </div>
      ${this.victims.length > 50 ? `
        <div class="ransomware-more">+${this.victims.length - 50} ${t('components.ransomware.moreVictims')}</div>
      ` : ''}
    `;
  }

  private renderVictimRow(victim: RansomwareVictim): string {
    const timeAgo = this.formatTimeAgo(new Date(victim.discoveredAt));
    const groupColor = this.getGroupColor(victim.group);

    return `
      <div class="ransomware-victim-row">
        <div class="ransomware-victim-main">
          <div class="ransomware-victim-name">${escapeHtml(victim.name)}</div>
          <div class="ransomware-victim-meta">
            <span class="ransomware-group-badge" style="background: ${groupColor}">${escapeHtml(victim.group)}</span>
            ${victim.country ? `<span class="ransomware-country">📍 ${escapeHtml(victim.country)}</span>` : ''}
            ${victim.sector ? `<span class="ransomware-sector">${escapeHtml(victim.sector)}</span>` : ''}
            <span class="ransomware-time">${timeAgo}</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderGroups(): string {
    if (this.groups.length === 0) {
      return `<div class="ransomware-empty">${t('components.ransomware.noGroups')}</div>`;
    }

    const sortedGroups = [...this.groups].sort((a, b) => b.victimCount - a.victimCount);
    const groupsHtml = sortedGroups.slice(0, 30).map(group => this.renderGroupRow(group)).join('');

    return `
      <div class="ransomware-groups-list">
        ${groupsHtml}
      </div>
    `;
  }

  private renderGroupRow(group: RansomwareGroup): string {
    const color = this.getGroupColor(group.name);

    return `
      <div class="ransomware-group-row" data-group="${escapeHtml(group.name)}">
        <div class="ransomware-group-indicator" style="background: ${color}"></div>
        <div class="ransomware-group-main">
          <div class="ransomware-group-name">${escapeHtml(group.name)}</div>
          ${group.description ? `<div class="ransomware-group-desc">${escapeHtml(group.description.substring(0, 100))}${group.description.length > 100 ? '...' : ''}</div>` : ''}
        </div>
        <div class="ransomware-group-stats">
          <span class="ransomware-victim-count">${group.victimCount}</span>
          <span class="ransomware-victim-label">${t('components.ransomware.victims')}</span>
        </div>
      </div>
    `;
  }

  private renderStats(): string {
    if (this.victims.length === 0 && this.groups.length === 0) {
      return `<div class="ransomware-empty">${t('components.ransomware.noData')}</div>`;
    }

    const byGroup = this.countBy(this.victims, v => v.group);
    const byCountry = this.countBy(this.victims.filter(v => v.country), v => v.country);
    const bySector = this.countBy(this.victims.filter(v => v.sector), v => v.sector);

    const topGroups = Object.entries(byGroup).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topCountries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topSectors = Object.entries(bySector).sort((a, b) => b[1] - a[1]).slice(0, 8);

    return `
      <div class="ransomware-stats">
        <div class="ransomware-stat-header">
          <span class="ransomware-stat-total">${this.victims.length}</span>
          <span>${t('components.ransomware.victimsLast30Days')}</span>
        </div>

        <div class="ransomware-stat-section">
          <h4>${t('components.ransomware.topGroups')}</h4>
          <div class="ransomware-stat-bars">
            ${topGroups.map(([group, count]) => `
              <div class="ransomware-stat-row">
                <span class="ransomware-stat-label">${escapeHtml(group)}</span>
                <div class="ransomware-stat-bar">
                  <div class="ransomware-stat-fill" style="width: ${(count / this.victims.length) * 100}%; background: ${this.getGroupColor(group)}"></div>
                </div>
                <span class="ransomware-stat-count">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="ransomware-stat-section">
          <h4>${t('components.ransomware.topCountries')}</h4>
          <div class="ransomware-stat-bars">
            ${topCountries.map(([country, count]) => `
              <div class="ransomware-stat-row">
                <span class="ransomware-stat-label">${escapeHtml(country)}</span>
                <div class="ransomware-stat-bar">
                  <div class="ransomware-stat-fill" style="width: ${(count / this.victims.length) * 100}%"></div>
                </div>
                <span class="ransomware-stat-count">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="ransomware-stat-section">
          <h4>${t('components.ransomware.topSectors')}</h4>
          <div class="ransomware-stat-bars">
            ${topSectors.map(([sector, count]) => `
              <div class="ransomware-stat-row">
                <span class="ransomware-stat-label">${escapeHtml(sector)}</span>
                <div class="ransomware-stat-bar">
                  <div class="ransomware-stat-fill" style="width: ${(count / this.victims.length) * 100}%"></div>
                </div>
                <span class="ransomware-stat-count">${count}</span>
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

  private getGroupColor(groupName: string): string {
    const hash = groupName.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 45%)`;
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
