import { Panel } from './Panel';
import { t } from '@/services/i18n';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { startSmartPollLoop, type SmartPollLoopHandle } from '@/services/runtime';
import { rssProxyUrl } from '@/utils';
import { fetchFeed } from '@/services/rss';

type CategoryFilter = 'all' | 'news' | 'research' | 'vendor' | 'gov';

interface CyberNewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  pubDate: Date;
  category: CategoryFilter;
  description?: string;
}

interface CyberNewsSource {
  name: string;
  url: string;
  category: CategoryFilter;
}

const rss = rssProxyUrl;

const CYBER_NEWS_SOURCES: CyberNewsSource[] = [
  // Top Security News
  { name: 'Krebs on Security', url: rss('https://krebsonsecurity.com/feed/'), category: 'news' },
  { name: 'The Hacker News', url: rss('https://feeds.feedburner.com/TheHackersNews'), category: 'news' },
  { name: 'Dark Reading', url: rss('https://www.darkreading.com/rss.xml'), category: 'news' },
  { name: 'Bleeping Computer', url: rss('https://www.bleepingcomputer.com/feed/'), category: 'news' },
  { name: 'SecurityWeek', url: rss('https://feeds.feedburner.com/securityweek'), category: 'news' },
  { name: 'Schneier on Security', url: rss('https://www.schneier.com/feed/'), category: 'research' },
  { name: 'Threatpost', url: rss('https://threatpost.com/feed/'), category: 'news' },
  { name: 'SC Media', url: rss('https://www.scmagazine.com/feed'), category: 'news' },
  { name: 'The Register', url: rss('https://www.theregister.com/security/headlines.atom'), category: 'news' },

  // Research & Analysis
  { name: 'The Record', url: rss('https://therecord.media/feed/'), category: 'research' },
  { name: 'Risky Business', url: rss('https://risky.biz/feeds/risky-business/'), category: 'research' },
  { name: 'SANS ISC', url: rss('https://isc.sans.edu/rssfeed.xml'), category: 'research' },

  // Vendor Security Blogs (high-quality threat intel)
  { name: 'Microsoft Security', url: rss('https://www.microsoft.com/en-us/security/blog/feed/'), category: 'vendor' },
  { name: 'Google TAG', url: rss('https://blog.google/threat-analysis-group/rss/'), category: 'vendor' },
  { name: 'Mandiant', url: rss('https://www.mandiant.com/resources/blog/rss.xml'), category: 'vendor' },
  { name: 'Recorded Future', url: rss('https://www.recordedfuture.com/feed'), category: 'vendor' },
  { name: 'CrowdStrike', url: rss('https://www.crowdstrike.com/blog/feed/'), category: 'vendor' },
  { name: 'SentinelOne', url: rss('https://www.sentinelone.com/blog/feed/'), category: 'vendor' },

  // Government / Official Sources
  { name: 'CISA Advisories', url: rss('https://www.cisa.gov/cybersecurity-advisories/all.xml'), category: 'gov' },
  { name: 'NCSC UK', url: rss('https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml'), category: 'gov' },
  { name: 'FBI Cyber', url: rss('https://www.ic3.gov/Media/RSS/'), category: 'gov' },
];

export class CyberSecurityNewsPanel extends Panel {
  private items: CyberNewsItem[] = [];
  private activeFilter: CategoryFilter = 'all';
  private lastUpdate: Date | null = null;
  private pollHandle: SmartPollLoopHandle | null = null;
  private sourceErrors: Map<string, number> = new Map();

  constructor() {
    super({
      id: 'cyber-news',
      title: t('panels.cyberNews'),
      showCount: true,
      trackActivity: true,
      infoTooltip: t('components.cyberNews.infoTooltip'),
    });

    this.content.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const filterBtn = target.closest('.cyber-news-filter') as HTMLElement | null;
      if (filterBtn?.dataset.filter) {
        this.activeFilter = filterBtn.dataset.filter as CategoryFilter;
        this.render();
        return;
      }

      const refreshBtn = target.closest('.cyber-news-refresh');
      if (refreshBtn) {
        void this.refresh();
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
      const results = await Promise.allSettled(
        CYBER_NEWS_SOURCES.map(source => this.fetchSource(source))
      );

      const allItems: CyberNewsItem[] = [];
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          allItems.push(...result.value);
          this.sourceErrors.delete(CYBER_NEWS_SOURCES[idx]!.name);
        } else if (result.status === 'rejected') {
          const name = CYBER_NEWS_SOURCES[idx]!.name;
          this.sourceErrors.set(name, (this.sourceErrors.get(name) || 0) + 1);
        }
      });

      allItems.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

      const seen = new Set<string>();
      this.items = allItems.filter(item => {
        const key = item.title.toLowerCase().substring(0, 50);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      this.lastUpdate = new Date();
      this.setCount(this.items.length);
      this.resetRetryBackoff();
      this.render();
    } catch (error) {
      if (this.isAbortError(error)) return;
      console.error('[CyberSecurityNewsPanel] Failed to fetch news:', error);
      if (this.items.length === 0) {
        this.showError(t('components.cyberNews.fetchError'), () => void this.refresh());
      }
    } finally {
      this.setFetching(false);
    }
  }

  private async fetchSource(source: CyberNewsSource): Promise<CyberNewsItem[]> {
    try {
      const items = await fetchFeed({ name: source.name, url: source.url });
      return items.slice(0, 15).map((item, idx) => ({
        id: `${source.name}-${idx}-${item.pubDate?.getTime() || Date.now()}`,
        title: item.title || 'Untitled',
        link: item.link || '',
        source: source.name,
        pubDate: item.pubDate || new Date(),
        category: source.category,
        description: (item as unknown as { description?: string }).description,
      }));
    } catch {
      return [];
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

  private render(): void {
    const filtersHtml = `
      <div class="cyber-news-filters">
        ${(['all', 'news', 'research', 'vendor', 'gov'] as CategoryFilter[]).map(filter => `
          <button class="cyber-news-filter ${this.activeFilter === filter ? 'active' : ''}" data-filter="${filter}">
            ${this.getFilterIcon(filter)} ${this.getFilterLabel(filter)}
          </button>
        `).join('')}
      </div>
    `;

    let filteredItems = this.items;
    if (this.activeFilter !== 'all') {
      filteredItems = filteredItems.filter(item => item.category === this.activeFilter);
    }

    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const recentCount = this.items.filter(item => now - item.pubDate.getTime() < oneHour).length;

    const statsHtml = `
      <div class="cyber-news-stats">
        <span class="cyber-news-stat">
          <span class="cyber-news-stat-value">${this.items.length}</span>
          <span class="cyber-news-stat-label">${t('components.cyberNews.totalArticles')}</span>
        </span>
        <span class="cyber-news-stat">
          <span class="cyber-news-stat-value">${recentCount}</span>
          <span class="cyber-news-stat-label">${t('components.cyberNews.lastHour')}</span>
        </span>
        <span class="cyber-news-stat">
          <span class="cyber-news-stat-value">${CYBER_NEWS_SOURCES.length - this.sourceErrors.size}</span>
          <span class="cyber-news-stat-label">${t('components.cyberNews.activeSources')}</span>
        </span>
      </div>
    `;

    let listHtml: string;
    if (filteredItems.length === 0) {
      listHtml = `<div class="cyber-news-empty">${t('components.cyberNews.noItems')}</div>`;
    } else {
      listHtml = `
        <div class="cyber-news-list">
          ${filteredItems.slice(0, 50).map(item => this.renderItem(item)).join('')}
        </div>
      `;
    }

    const updateTime = this.lastUpdate
      ? this.lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    const footerHtml = `
      <div class="cyber-news-footer">
        <span class="cyber-news-sources">${CYBER_NEWS_SOURCES.length} ${t('components.cyberNews.sources')}</span>
        <span class="cyber-news-update">${updateTime}</span>
        <button class="cyber-news-refresh" title="${t('common.refresh')}">↻</button>
      </div>
    `;

    this.setContent(`
      ${statsHtml}
      ${filtersHtml}
      ${listHtml}
      ${footerHtml}
    `);
  }

  private renderItem(item: CyberNewsItem): string {
    const timeAgo = this.formatTimeAgo(item.pubDate);
    const categoryClass = `cyber-news-category-${item.category}`;

    return `
      <div class="cyber-news-item ${categoryClass}">
        <div class="cyber-news-item-header">
          <span class="cyber-news-item-source">${escapeHtml(item.source)}</span>
          <span class="cyber-news-item-category">${this.getFilterIcon(item.category)}</span>
          <span class="cyber-news-item-time">${timeAgo}</span>
        </div>
        <a class="cyber-news-item-title" href="${sanitizeUrl(item.link)}" target="_blank" rel="noopener">
          ${escapeHtml(item.title)}
        </a>
      </div>
    `;
  }

  private getFilterIcon(filter: CategoryFilter): string {
    switch (filter) {
      case 'all': return '📰';
      case 'news': return '🗞️';
      case 'research': return '🔬';
      case 'vendor': return '🛡️';
      case 'gov': return '🏛️';
    }
  }

  private getFilterLabel(filter: CategoryFilter): string {
    switch (filter) {
      case 'all': return t('common.all');
      case 'news': return t('components.cyberNews.filterNews');
      case 'research': return t('components.cyberNews.filterResearch');
      case 'vendor': return t('components.cyberNews.filterVendor');
      case 'gov': return t('components.cyberNews.filterGov');
    }
  }

  private formatTimeAgo(date: Date): string {
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('components.cyberNews.justNow');
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  }

  public destroy(): void {
    this.stopPolling();
    super.destroy();
  }
}
