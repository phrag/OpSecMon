import { Panel } from './Panel';
import { fetchTelegramFeed } from '@/services/telegram-intel';
import { fetchGdeltArticles, type GdeltArticle, INTEL_TOPICS, type IntelTopic } from '@/services/gdelt-intel';
import { t } from '@/services/i18n';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { startSmartPollLoop, type SmartPollLoopHandle } from '@/services/runtime';

type TabId = 'feed' | 'topics' | 'sources';
type SourceFilter = 'all' | 'telegram' | 'gdelt' | 'security';

interface OSINTItem {
  id: string;
  source: 'telegram' | 'gdelt' | 'security';
  title: string;
  url: string;
  channel?: string;
  timestamp: Date;
  topic?: string;
  tags?: string[];
  earlySignal?: boolean;
}

export class OSINTPanel extends Panel {
  private items: OSINTItem[] = [];
  private activeTab: TabId = 'feed';
  private sourceFilter: SourceFilter = 'all';
  private topicFilter: string = 'all';
  private lastUpdate: Date | null = null;
  private pollHandle: SmartPollLoopHandle | null = null;
  private gdeltByTopic: Map<string, GdeltArticle[]> = new Map();

  constructor() {
    super({
      id: 'osint',
      title: t('panels.osint'),
      showCount: true,
      infoTooltip: t('components.osint.infoTooltip'),
    });

    this.content.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const tab = target.closest('.panel-tab') as HTMLElement | null;
      if (tab?.dataset.tab) {
        this.activeTab = tab.dataset.tab as TabId;
        this.render();
        return;
      }

      const filterBtn = target.closest('.osint-source-filter') as HTMLElement | null;
      if (filterBtn?.dataset.source) {
        this.sourceFilter = filterBtn.dataset.source as SourceFilter;
        this.render();
        return;
      }

      const topicBtn = target.closest('.osint-topic-filter') as HTMLElement | null;
      if (topicBtn?.dataset.topic) {
        this.topicFilter = topicBtn.dataset.topic;
        this.render();
        return;
      }

      const itemLink = target.closest('.osint-item') as HTMLElement | null;
      if (itemLink?.dataset.url) {
        window.open(sanitizeUrl(itemLink.dataset.url), '_blank');
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
      const allItems: OSINTItem[] = [];

      const [telegramResult, gdeltResults] = await Promise.allSettled([
        this.fetchTelegramItems(),
        this.fetchGdeltItems(),
      ]);

      if (telegramResult.status === 'fulfilled') {
        allItems.push(...telegramResult.value);
      }

      if (gdeltResults.status === 'fulfilled') {
        allItems.push(...gdeltResults.value);
      }

      allItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      this.items = allItems;
      this.lastUpdate = new Date();
      this.setCount(this.items.length);
      this.resetRetryBackoff();
      this.render();
    } catch (error) {
      if (this.isAbortError(error)) return;
      console.error('[OSINTPanel] Failed to fetch OSINT data:', error);
      if (this.items.length === 0) {
        this.showError(t('components.osint.fetchError'), () => void this.refresh());
      }
    } finally {
      this.setFetching(false);
    }
  }

  private async fetchTelegramItems(): Promise<OSINTItem[]> {
    try {
      const resp = await fetchTelegramFeed(50);
      if (!resp.enabled || !resp.items?.length) return [];
      
      return resp.items.map(item => ({
        id: `telegram-${item.id}`,
        source: 'telegram' as const,
        title: item.text.substring(0, 200),
        url: item.url,
        channel: item.channelTitle,
        timestamp: new Date(item.ts),
        topic: item.topic,
        tags: item.tags,
        earlySignal: item.earlySignal,
      }));
    } catch {
      return [];
    }
  }

  private async fetchGdeltItems(): Promise<OSINTItem[]> {
    const cyberTopic = INTEL_TOPICS.find(t => t.id === 'cyber');
    const intelTopic = INTEL_TOPICS.find(t => t.id === 'intelligence');

    const topics = [cyberTopic, intelTopic].filter(Boolean) as IntelTopic[];
    const items: OSINTItem[] = [];

    for (const topic of topics) {
      try {
        const articles = await fetchGdeltArticles(topic.query, 20);
        this.gdeltByTopic.set(topic.id, articles);
        
        for (const article of articles) {
          items.push({
            id: `gdelt-${article.url}`,
            source: 'gdelt' as const,
            title: article.title,
            url: article.url,
            channel: article.source,
            timestamp: new Date(article.date),
            topic: topic.id,
          });
        }
      } catch {
        continue;
      }
    }

    return items;
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

  private render(): void {
    const tabsHtml = `
      <div class="panel-tabs">
        <button class="panel-tab ${this.activeTab === 'feed' ? 'active' : ''}" data-tab="feed">
          📡 ${t('components.osint.tabs.feed')}
        </button>
        <button class="panel-tab ${this.activeTab === 'topics' ? 'active' : ''}" data-tab="topics">
          🏷️ ${t('components.osint.tabs.topics')}
        </button>
        <button class="panel-tab ${this.activeTab === 'sources' ? 'active' : ''}" data-tab="sources">
          📊 ${t('components.osint.tabs.sources')}
        </button>
      </div>
    `;

    let contentHtml = '';
    switch (this.activeTab) {
      case 'feed':
        contentHtml = this.renderFeed();
        break;
      case 'topics':
        contentHtml = this.renderTopics();
        break;
      case 'sources':
        contentHtml = this.renderSources();
        break;
    }

    const updateTime = this.lastUpdate
      ? this.lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    this.setContent(`
      ${tabsHtml}
      <div class="osint-content">
        ${contentHtml}
      </div>
      <div class="osint-footer">
        <span class="osint-source">GDELT • Telegram • RSS</span>
        <span class="osint-update-time">${updateTime}</span>
      </div>
    `);
  }

  private renderFeed(): string {
    const filtersHtml = `
      <div class="osint-filters">
        ${(['all', 'telegram', 'gdelt', 'security'] as SourceFilter[]).map(source => `
          <button class="osint-source-filter ${this.sourceFilter === source ? 'active' : ''}" data-source="${source}">
            ${this.getSourceIcon(source)} ${this.getSourceLabel(source)}
          </button>
        `).join('')}
      </div>
    `;

    let filteredItems = this.items;
    if (this.sourceFilter !== 'all') {
      filteredItems = filteredItems.filter(item => item.source === this.sourceFilter);
    }

    if (filteredItems.length === 0) {
      return `
        ${filtersHtml}
        <div class="osint-empty">${t('components.osint.noItems')}</div>
      `;
    }

    const itemsHtml = filteredItems.slice(0, 40).map(item => this.renderItem(item)).join('');

    return `
      ${filtersHtml}
      <div class="osint-feed-list">
        ${itemsHtml}
      </div>
    `;
  }

  private renderItem(item: OSINTItem): string {
    const timeAgo = this.formatTimeAgo(item.timestamp);
    const sourceIcon = this.getSourceIcon(item.source);

    return `
      <div class="osint-item" data-url="${escapeHtml(item.url)}">
        <div class="osint-item-header">
          <span class="osint-item-source">${sourceIcon}</span>
          ${item.channel ? `<span class="osint-item-channel">${escapeHtml(item.channel)}</span>` : ''}
          <span class="osint-item-time">${timeAgo}</span>
          ${item.earlySignal ? `<span class="osint-early-signal">⚡ ${t('components.osint.earlySignal')}</span>` : ''}
        </div>
        <div class="osint-item-title">${escapeHtml(item.title)}</div>
        ${item.tags?.length ? `
          <div class="osint-item-tags">
            ${item.tags.slice(0, 3).map(tag => `<span class="osint-tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderTopics(): string {
    const topicsHtml = `
      <div class="osint-topic-filters">
        ${(['all', 'cyber', 'intelligence', 'military', 'nuclear', 'sanctions'] as string[]).map(topic => `
          <button class="osint-topic-filter ${this.topicFilter === topic ? 'active' : ''}" data-topic="${topic}">
            ${this.getTopicIcon(topic)} ${this.getTopicLabel(topic)}
          </button>
        `).join('')}
      </div>
    `;

    let filteredItems = this.items;
    if (this.topicFilter !== 'all') {
      filteredItems = filteredItems.filter(item => item.topic === this.topicFilter);
    }

    if (filteredItems.length === 0) {
      return `
        ${topicsHtml}
        <div class="osint-empty">${t('components.osint.noItems')}</div>
      `;
    }

    const itemsHtml = filteredItems.slice(0, 30).map(item => this.renderItem(item)).join('');

    return `
      ${topicsHtml}
      <div class="osint-feed-list">
        ${itemsHtml}
      </div>
    `;
  }

  private renderSources(): string {
    const bySource = this.countBy(this.items, i => i.source);
    const byTopic = this.countBy(this.items.filter(i => i.topic), i => i.topic!);

    return `
      <div class="osint-sources-stats">
        <div class="osint-stats-section">
          <h4>${t('components.osint.bySource')}</h4>
          <div class="osint-source-bars">
            ${Object.entries(bySource).map(([source, count]) => `
              <div class="osint-source-row">
                <span class="osint-source-icon">${this.getSourceIcon(source as SourceFilter)}</span>
                <span class="osint-source-name">${this.getSourceLabel(source as SourceFilter)}</span>
                <div class="osint-source-bar">
                  <div class="osint-source-fill" style="width: ${(count / this.items.length) * 100}%"></div>
                </div>
                <span class="osint-source-count">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="osint-stats-section">
          <h4>${t('components.osint.byTopic')}</h4>
          <div class="osint-topic-bars">
            ${Object.entries(byTopic).map(([topic, count]) => `
              <div class="osint-topic-row">
                <span class="osint-topic-icon">${this.getTopicIcon(topic)}</span>
                <span class="osint-topic-name">${this.getTopicLabel(topic)}</span>
                <div class="osint-topic-bar">
                  <div class="osint-topic-fill" style="width: ${(count / this.items.length) * 100}%"></div>
                </div>
                <span class="osint-topic-count">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="osint-stats-section">
          <h4>${t('components.osint.coverage')}</h4>
          <div class="osint-coverage-info">
            <p>${t('components.osint.coverageDesc')}</p>
            <ul>
              <li>📱 Telegram OSINT channels</li>
              <li>🌐 GDELT global news intelligence</li>
              <li>🔒 Security RSS feeds</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  private getSourceIcon(source: SourceFilter | string): string {
    switch (source) {
      case 'telegram': return '📱';
      case 'gdelt': return '🌐';
      case 'security': return '🔒';
      case 'all': return '📡';
      default: return '📄';
    }
  }

  private getSourceLabel(source: SourceFilter): string {
    switch (source) {
      case 'all': return t('common.all');
      case 'telegram': return 'Telegram';
      case 'gdelt': return 'GDELT';
      case 'security': return 'Security';
    }
  }

  private getTopicIcon(topic: string): string {
    switch (topic) {
      case 'cyber': return '🔓';
      case 'intelligence': return '🕵️';
      case 'military': return '⚔️';
      case 'nuclear': return '☢️';
      case 'sanctions': return '🚫';
      case 'all': return '🏷️';
      default: return '📄';
    }
  }

  private getTopicLabel(topic: string): string {
    switch (topic) {
      case 'all': return t('common.all');
      case 'cyber': return t('components.osint.topicCyber');
      case 'intelligence': return t('components.osint.topicIntelligence');
      case 'military': return t('components.osint.topicMilitary');
      case 'nuclear': return t('components.osint.topicNuclear');
      case 'sanctions': return t('components.osint.topicSanctions');
      default: return topic;
    }
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

    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  }

  public destroy(): void {
    this.stopPolling();
    super.destroy();
  }
}
