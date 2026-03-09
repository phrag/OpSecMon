import { Panel } from './Panel';
import type { APTGroup } from '@/services/cyber/apt';
import { getAPTGroups, getAttributionColor, searchAPTGroups, getDataLastUpdated } from '@/services/cyber/apt';
import { t } from '@/services/i18n';
import { escapeHtml } from '@/utils/sanitize';

type TabId = 'groups' | 'attribution' | 'sectors';
type AttributionFilter = 'all' | 'Russia' | 'China' | 'North Korea' | 'Iran' | 'Cybercrime' | 'Other';

export class APTGroupsPanel extends Panel {
  private groups: APTGroup[] = [];
  private filteredGroups: APTGroup[] = [];
  private activeTab: TabId = 'groups';
  private attributionFilter: AttributionFilter = 'all';
  private searchQuery: string = '';
  private expandedGroup: string | null = null;
  private onMapLayerToggle: ((enabled: boolean) => void) | null = null;

  constructor() {
    super({
      id: 'apt-groups',
      title: t('panels.aptGroups'),
      showCount: true,
      infoTooltip: t('components.apt.infoTooltip'),
    });

    this.content.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const tab = target.closest('.panel-tab') as HTMLElement | null;
      if (tab?.dataset.tab) {
        this.activeTab = tab.dataset.tab as TabId;
        this.render();
        return;
      }

      const filterBtn = target.closest('.apt-attribution-filter') as HTMLElement | null;
      if (filterBtn?.dataset.attribution) {
        this.attributionFilter = filterBtn.dataset.attribution as AttributionFilter;
        this.applyFilters();
        this.render();
        return;
      }

      const groupRow = target.closest('.apt-group-row') as HTMLElement | null;
      if (groupRow?.dataset.groupId) {
        this.expandedGroup = this.expandedGroup === groupRow.dataset.groupId ? null : groupRow.dataset.groupId;
        this.render();
        return;
      }

      const mapToggle = target.closest('.apt-map-toggle') as HTMLElement | null;
      if (mapToggle) {
        this.onMapLayerToggle?.(true);
        return;
      }
    });

    this.content.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.classList.contains('apt-search-input')) {
        this.searchQuery = target.value;
        this.applyFilters();
        this.render();
      }
    });

    this.loadData();
  }

  public setMapLayerToggleHandler(handler: (enabled: boolean) => void): void {
    this.onMapLayerToggle = handler;
  }

  private loadData(): void {
    this.groups = getAPTGroups();
    this.applyFilters();
    this.setCount(this.groups.length);
    this.render();
  }

  private applyFilters(): void {
    let filtered = this.groups;

    if (this.searchQuery) {
      filtered = searchAPTGroups(this.searchQuery);
    }

    if (this.attributionFilter !== 'all') {
      if (this.attributionFilter === 'Other') {
        filtered = filtered.filter(g => 
          !['russia', 'china', 'north korea', 'iran', 'cybercrime'].includes(g.attribution.toLowerCase())
        );
      } else {
        filtered = filtered.filter(g => 
          g.attribution.toLowerCase() === this.attributionFilter.toLowerCase()
        );
      }
    }

    this.filteredGroups = filtered;
    this.setCount(filtered.length);
  }

  private render(): void {
    const tabsHtml = `
      <div class="panel-tabs">
        <button class="panel-tab ${this.activeTab === 'groups' ? 'active' : ''}" data-tab="groups">
          👥 ${t('components.apt.tabs.groups')}
        </button>
        <button class="panel-tab ${this.activeTab === 'attribution' ? 'active' : ''}" data-tab="attribution">
          🌍 ${t('components.apt.tabs.attribution')}
        </button>
        <button class="panel-tab ${this.activeTab === 'sectors' ? 'active' : ''}" data-tab="sectors">
          🎯 ${t('components.apt.tabs.sectors')}
        </button>
      </div>
    `;

    let contentHtml = '';
    switch (this.activeTab) {
      case 'groups':
        contentHtml = this.renderGroups();
        break;
      case 'attribution':
        contentHtml = this.renderByAttribution();
        break;
      case 'sectors':
        contentHtml = this.renderBySectors();
        break;
    }

    this.setContent(`
      ${tabsHtml}
      <div class="apt-content">
        ${contentHtml}
      </div>
      <div class="apt-footer">
        <button class="apt-map-toggle cyber-map-toggle" title="${t('components.apt.showOnMap')}">
          🗺️ ${t('components.apt.showOnMap')}
        </button>
        <span class="apt-source">MITRE ATT&CK</span>
        <span class="apt-updated">${t('components.apt.lastUpdated')}: ${getDataLastUpdated()}</span>
      </div>
    `);
  }

  private renderGroups(): string {
    const searchHtml = `
      <div class="apt-search">
        <input type="text" class="apt-search-input" placeholder="${t('components.apt.searchPlaceholder')}" value="${escapeHtml(this.searchQuery)}">
      </div>
    `;

    const filtersHtml = `
      <div class="apt-filters">
        ${(['all', 'Cybercrime', 'Russia', 'China', 'North Korea', 'Iran', 'Other'] as AttributionFilter[]).map(attr => `
          <button class="apt-attribution-filter ${this.attributionFilter === attr ? 'active' : ''}" 
                  data-attribution="${attr}"
                  ${attr !== 'all' && attr !== 'Other' ? `style="border-color: ${getAttributionColor(attr)}"` : ''}>
            ${attr === 'all' ? t('common.all') : attr}
          </button>
        `).join('')}
      </div>
    `;

    if (this.filteredGroups.length === 0) {
      return `
        ${searchHtml}
        ${filtersHtml}
        <div class="apt-empty">${t('components.apt.noGroups')}</div>
      `;
    }

    const groupsHtml = this.filteredGroups.map(group => this.renderGroupRow(group)).join('');

    return `
      ${searchHtml}
      ${filtersHtml}
      <div class="apt-groups-list">
        ${groupsHtml}
      </div>
    `;
  }

  private renderGroupRow(group: APTGroup): string {
    const color = getAttributionColor(group.attribution);
    const isExpanded = this.expandedGroup === group.id;
    const activityBadge = this.getActivityBadge(group.activityLevel);

    return `
      <div class="apt-group-row ${isExpanded ? 'expanded' : ''}" data-group-id="${escapeHtml(group.id)}">
        <div class="apt-group-header">
          <div class="apt-group-indicator" style="background: ${color}"></div>
          <div class="apt-group-info">
            <div class="apt-group-name">${escapeHtml(group.name)}${activityBadge}</div>
            <div class="apt-group-attribution" style="color: ${color}">${escapeHtml(group.attribution)}</div>
          </div>
          <div class="apt-group-badge">${group.ttps.length} TTPs</div>
          <span class="apt-expand-icon">${isExpanded ? '▼' : '▶'}</span>
        </div>
        ${isExpanded ? this.renderGroupDetails(group) : ''}
      </div>
    `;
  }

  private getActivityBadge(activityLevel?: string): string {
    if (!activityLevel) return '';
    switch (activityLevel) {
      case 'very_high':
        return ' <span class="apt-activity-badge very-high" title="Very High Activity">🔥</span>';
      case 'high':
        return ' <span class="apt-activity-badge high" title="High Activity">⚡</span>';
      case 'medium':
        return ' <span class="apt-activity-badge medium" title="Medium Activity">●</span>';
      case 'low':
        return ' <span class="apt-activity-badge low" title="Low Activity">○</span>';
      default:
        return '';
    }
  }

  private renderGroupDetails(group: APTGroup): string {
    const knownBreachesHtml = group.knownBreaches && group.knownBreaches.length > 0 
      ? `
        <div class="apt-detail-row">
          <span class="apt-detail-label">${t('components.apt.knownBreaches')}:</span>
          <div class="apt-tags apt-breaches">
            ${group.knownBreaches.map(b => `<span class="apt-tag breach-tag">${escapeHtml(b)}</span>`).join('')}
          </div>
        </div>
      ` 
      : '';

    const activityLevelHtml = group.activityLevel 
      ? `
        <div class="apt-detail-row">
          <span class="apt-detail-label">${t('components.apt.activityLevel')}:</span>
          <span class="apt-detail-value apt-activity-${group.activityLevel}">${this.formatActivityLevel(group.activityLevel)}</span>
        </div>
      `
      : '';

    return `
      <div class="apt-group-details">
        <div class="apt-detail-row">
          <span class="apt-detail-label">${t('components.apt.aliases')}:</span>
          <span class="apt-detail-value">${group.aliases.length > 0 ? group.aliases.map(a => escapeHtml(a)).join(', ') : 'None known'}</span>
        </div>
        <div class="apt-detail-row">
          <span class="apt-detail-label">${t('components.apt.description')}:</span>
          <span class="apt-detail-value apt-description">${escapeHtml(group.description)}</span>
        </div>
        ${activityLevelHtml}
        ${knownBreachesHtml}
        <div class="apt-detail-row">
          <span class="apt-detail-label">${t('components.apt.targetSectors')}:</span>
          <div class="apt-tags">
            ${group.targetSectors.map(s => `<span class="apt-tag">${escapeHtml(s)}</span>`).join('')}
          </div>
        </div>
        <div class="apt-detail-row">
          <span class="apt-detail-label">${t('components.apt.targetRegions')}:</span>
          <div class="apt-tags">
            ${group.targetRegions.map(r => `<span class="apt-tag">${escapeHtml(r)}</span>`).join('')}
          </div>
        </div>
        <div class="apt-detail-row">
          <span class="apt-detail-label">${t('components.apt.ttps')}:</span>
          <div class="apt-ttps">
            ${group.ttps.map(ttp => `<span class="apt-ttp">${escapeHtml(ttp)}</span>`).join('')}
          </div>
        </div>
        <div class="apt-detail-row">
          <span class="apt-detail-label">${t('components.apt.lastActive')}:</span>
          <span class="apt-detail-value">${escapeHtml(group.lastActive)}</span>
        </div>
      </div>
    `;
  }

  private formatActivityLevel(level: string): string {
    switch (level) {
      case 'very_high': return '🔥 Very High';
      case 'high': return '⚡ High';
      case 'medium': return '● Medium';
      case 'low': return '○ Low';
      default: return level;
    }
  }

  private renderByAttribution(): string {
    const byAttribution = this.countBy(this.groups, g => g.attribution);
    const sorted = Object.entries(byAttribution).sort((a, b) => b[1] - a[1]);

    return `
      <div class="apt-attribution-chart">
        ${sorted.map(([attribution, count]) => `
          <div class="apt-attribution-row">
            <div class="apt-attribution-bar-label">
              <span class="apt-attribution-name" style="color: ${getAttributionColor(attribution)}">${escapeHtml(attribution)}</span>
              <span class="apt-attribution-count">${count} ${t('components.apt.groups')}</span>
            </div>
            <div class="apt-attribution-bar">
              <div class="apt-attribution-fill" style="width: ${(count / this.groups.length) * 100}%; background: ${getAttributionColor(attribution)}"></div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="apt-attribution-map">
        <h4>${t('components.apt.groupsByCountry')}</h4>
        ${sorted.map(([attribution, count]) => {
          const groups = this.groups.filter(g => g.attribution === attribution);
          return `
            <div class="apt-country-section">
              <div class="apt-country-header" style="border-left-color: ${getAttributionColor(attribution)}">
                <span>${escapeHtml(attribution)}</span>
                <span class="apt-country-count">${count}</span>
              </div>
              <div class="apt-country-groups">
                ${groups.map(g => `<span class="apt-group-chip">${escapeHtml(g.name)}</span>`).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  private renderBySectors(): string {
    const allSectors: Record<string, APTGroup[]> = {};
    for (const group of this.groups) {
      for (const sector of group.targetSectors) {
        if (!allSectors[sector]) allSectors[sector] = [];
        allSectors[sector].push(group);
      }
    }

    const sortedSectors = Object.entries(allSectors).sort((a, b) => b[1].length - a[1].length);

    return `
      <div class="apt-sectors">
        <div class="apt-sector-header">
          <span>${t('components.apt.mostTargeted')}</span>
        </div>
        ${sortedSectors.map(([sector, groups]) => `
          <div class="apt-sector-row">
            <div class="apt-sector-info">
              <span class="apt-sector-name">${escapeHtml(sector)}</span>
              <span class="apt-sector-count">${groups.length} ${t('components.apt.groups')}</span>
            </div>
            <div class="apt-sector-groups">
              ${groups.slice(0, 5).map(g => `
                <span class="apt-group-mini" style="border-color: ${getAttributionColor(g.attribution)}" title="${escapeHtml(g.name)} (${escapeHtml(g.attribution)})">${escapeHtml(g.name.substring(0, 8))}</span>
              `).join('')}
              ${groups.length > 5 ? `<span class="apt-group-more">+${groups.length - 5}</span>` : ''}
            </div>
          </div>
        `).join('')}
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
}
