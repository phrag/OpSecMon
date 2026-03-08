import { Panel } from './Panel';
import { t } from '@/services/i18n';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { startSmartPollLoop, type SmartPollLoopHandle } from '@/services/runtime';
import { rssProxyUrl } from '@/utils';
import { fetchFeed } from '@/services/rss';

type BlogCategory = 'all' | 'research' | 'vendor' | 'personal' | 'team';

interface SecurityBlogItem {
  id: string;
  title: string;
  link: string;
  source: string;
  pubDate: Date;
  category: BlogCategory;
  description?: string;
  author?: string;
}

interface SecurityBlogSource {
  name: string;
  url: string;
  category: BlogCategory;
  author?: string;
}

const rss = rssProxyUrl;

const SECURITY_BLOG_SOURCES: SecurityBlogSource[] = [
  // Personal Security Researcher Blogs
  { name: 'Krebs on Security', url: rss('https://krebsonsecurity.com/feed/'), category: 'personal', author: 'Brian Krebs' },
  { name: 'Schneier on Security', url: rss('https://www.schneier.com/feed/'), category: 'personal', author: 'Bruce Schneier' },
  { name: 'Graham Cluley', url: rss('https://grahamcluley.com/feed/'), category: 'personal', author: 'Graham Cluley' },
  { name: 'Troy Hunt', url: rss('https://www.troyhunt.com/rss/'), category: 'personal', author: 'Troy Hunt' },
  { name: 'Daniel Miessler', url: rss('https://danielmiessler.com/feed/'), category: 'personal', author: 'Daniel Miessler' },
  { name: 'Naked Security', url: rss('https://nakedsecurity.sophos.com/feed/'), category: 'personal' },

  // Security Research Teams
  { name: 'Google Project Zero', url: rss('https://googleprojectzero.blogspot.com/feeds/posts/default'), category: 'research' },
  { name: 'SANS ISC', url: rss('https://isc.sans.edu/rssfeed.xml'), category: 'research' },
  { name: 'The Record', url: rss('https://therecord.media/feed/'), category: 'research' },
  { name: 'Risky Business', url: rss('https://risky.biz/feeds/risky-business/'), category: 'research' },
  { name: 'Talos Intelligence', url: rss('https://blog.talosintelligence.com/feeds/posts/default'), category: 'research' },
  { name: 'Unit 42', url: rss('https://unit42.paloaltonetworks.com/feed/'), category: 'research' },

  // Vendor Security Blogs
  { name: 'Microsoft Security', url: rss('https://www.microsoft.com/en-us/security/blog/feed/'), category: 'vendor' },
  { name: 'Google TAG', url: rss('https://blog.google/threat-analysis-group/rss/'), category: 'vendor' },
  { name: 'Mandiant', url: rss('https://www.mandiant.com/resources/blog/rss.xml'), category: 'vendor' },
  { name: 'CrowdStrike', url: rss('https://www.crowdstrike.com/blog/feed/'), category: 'vendor' },
  { name: 'SentinelOne', url: rss('https://www.sentinelone.com/blog/feed/'), category: 'vendor' },
  { name: 'Recorded Future', url: rss('https://www.recordedfuture.com/feed'), category: 'vendor' },
  { name: 'Secureworks', url: rss('https://www.secureworks.com/rss?feed=blog'), category: 'vendor' },
  { name: 'Elastic Security Labs', url: rss('https://www.elastic.co/security-labs/rss/feed.xml'), category: 'vendor' },
  { name: 'Trend Micro', url: rss('https://www.trendmicro.com/en_us/research.rss'), category: 'vendor' },
  { name: 'ESET', url: rss('https://www.welivesecurity.com/feed/'), category: 'vendor' },
  { name: 'Kaspersky', url: rss('https://securelist.com/feed/'), category: 'vendor' },
  { name: 'Check Point', url: rss('https://research.checkpoint.com/feed/'), category: 'vendor' },

  // Security Teams & Organizations
  { name: 'PortSwigger', url: rss('https://portswigger.net/daily-swig/rss'), category: 'team' },
  { name: 'Trail of Bits', url: rss('https://blog.trailofbits.com/feed/'), category: 'team' },
  { name: 'NCC Group', url: rss('https://research.nccgroup.com/feed/'), category: 'team' },
  { name: 'Bishop Fox', url: rss('https://bishopfox.com/feeds/blog.rss'), category: 'team' },
];

export class SecurityBlogsPanel extends Panel {
  private items: SecurityBlogItem[] = [];
  private activeFilter: BlogCategory = 'all';
  private lastUpdate: Date | null = null;
  private pollHandle: SmartPollLoopHandle | null = null;
  private sourceErrors: Map<string, number> = new Map();

  constructor() {
    super({
      id: 'security-blogs',
      title: t('panels.securityBlogs'),
      showCount: true,
      trackActivity: true,
      infoTooltip: t('components.securityBlogs.infoTooltip'),
    });

    this.content.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const filterBtn = target.closest('.security-blogs-filter') as HTMLElement | null;
      if (filterBtn?.dataset.filter) {
        this.activeFilter = filterBtn.dataset.filter as BlogCategory;
        this.render();
        return;
      }

      const refreshBtn = target.closest('.security-blogs-refresh');
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
        SECURITY_BLOG_SOURCES.map(source => this.fetchSource(source))
      );

      const allItems: SecurityBlogItem[] = [];
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          allItems.push(...result.value);
          this.sourceErrors.delete(SECURITY_BLOG_SOURCES[idx]!.name);
        } else if (result.status === 'rejected') {
          const name = SECURITY_BLOG_SOURCES[idx]!.name;
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
      console.error('[SecurityBlogsPanel] Failed to fetch blogs:', error);
      if (this.items.length === 0) {
        this.showError(t('components.securityBlogs.fetchError'), () => void this.refresh());
      }
    } finally {
      this.setFetching(false);
    }
  }

  private async fetchSource(source: SecurityBlogSource): Promise<SecurityBlogItem[]> {
    try {
      const items = await fetchFeed({ name: source.name, url: source.url });
      return items.slice(0, 10).map((item, idx) => ({
        id: `${source.name}-${idx}-${item.pubDate?.getTime() || Date.now()}`,
        title: item.title || 'Untitled',
        link: item.link || '',
        source: source.name,
        pubDate: item.pubDate || new Date(),
        category: source.category,
        description: (item as unknown as { description?: string }).description,
        author: source.author,
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
      <div class="security-blogs-filters">
        ${(['all', 'research', 'vendor', 'personal', 'team'] as BlogCategory[]).map(filter => `
          <button class="security-blogs-filter ${this.activeFilter === filter ? 'active' : ''}" data-filter="${filter}">
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
    const oneDay = 24 * 60 * 60 * 1000;
    const recentCount = this.items.filter(item => now - item.pubDate.getTime() < oneDay).length;

    const statsHtml = `
      <div class="security-blogs-stats">
        <span class="security-blogs-stat">
          <span class="security-blogs-stat-value">${this.items.length}</span>
          <span class="security-blogs-stat-label">${t('components.securityBlogs.totalPosts')}</span>
        </span>
        <span class="security-blogs-stat">
          <span class="security-blogs-stat-value">${recentCount}</span>
          <span class="security-blogs-stat-label">${t('components.securityBlogs.last24h')}</span>
        </span>
        <span class="security-blogs-stat">
          <span class="security-blogs-stat-value">${SECURITY_BLOG_SOURCES.length - this.sourceErrors.size}</span>
          <span class="security-blogs-stat-label">${t('components.securityBlogs.activeBlogs')}</span>
        </span>
      </div>
    `;

    let listHtml: string;
    if (filteredItems.length === 0) {
      listHtml = `<div class="security-blogs-empty">${t('components.securityBlogs.noItems')}</div>`;
    } else {
      listHtml = `
        <div class="security-blogs-list">
          ${filteredItems.slice(0, 50).map(item => this.renderItem(item)).join('')}
        </div>
      `;
    }

    const updateTime = this.lastUpdate
      ? this.lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    const footerHtml = `
      <div class="security-blogs-footer">
        <span class="security-blogs-sources">${SECURITY_BLOG_SOURCES.length} ${t('components.securityBlogs.blogs')}</span>
        <span class="security-blogs-update">${updateTime}</span>
        <button class="security-blogs-refresh" title="${t('common.refresh')}">↻</button>
      </div>
    `;

    this.setContent(`
      ${statsHtml}
      ${filtersHtml}
      ${listHtml}
      ${footerHtml}
    `);
  }

  private renderItem(item: SecurityBlogItem): string {
    const timeAgo = this.formatTimeAgo(item.pubDate);
    const categoryClass = `security-blogs-category-${item.category}`;
    const authorHtml = item.author ? `<span class="security-blogs-item-author">${escapeHtml(item.author)}</span>` : '';

    return `
      <div class="security-blogs-item ${categoryClass}">
        <div class="security-blogs-item-header">
          <span class="security-blogs-item-source">${escapeHtml(item.source)}</span>
          ${authorHtml}
          <span class="security-blogs-item-category">${this.getFilterIcon(item.category)}</span>
          <span class="security-blogs-item-time">${timeAgo}</span>
        </div>
        <a class="security-blogs-item-title" href="${sanitizeUrl(item.link)}" target="_blank" rel="noopener">
          ${escapeHtml(item.title)}
        </a>
      </div>
    `;
  }

  private getFilterIcon(filter: BlogCategory): string {
    switch (filter) {
      case 'all': return '📚';
      case 'research': return '🔬';
      case 'vendor': return '🛡️';
      case 'personal': return '✍️';
      case 'team': return '👥';
    }
  }

  private getFilterLabel(filter: BlogCategory): string {
    switch (filter) {
      case 'all': return t('common.all');
      case 'research': return t('components.securityBlogs.filterResearch');
      case 'vendor': return t('components.securityBlogs.filterVendor');
      case 'personal': return t('components.securityBlogs.filterPersonal');
      case 'team': return t('components.securityBlogs.filterTeam');
    }
  }

  private formatTimeAgo(date: Date): string {
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('components.securityBlogs.justNow');
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  }

  public destroy(): void {
    this.stopPolling();
    super.destroy();
  }
}
