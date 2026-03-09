import { Panel } from './Panel';
import { sanitizeUrl } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { h, replaceChildren } from '@/utils/dom-utils';
import {
  getIntelTopics,
  fetchTopicIntelligence,
  formatArticleDate,
  extractDomain,
  type GdeltArticle,
  type IntelTopic,
  type TopicIntelligence,
} from '@/services/gdelt-intel';

export class GdeltIntelPanel extends Panel {
  private activeTopic: IntelTopic = getIntelTopics()[0]!;
  private topicData = new Map<string, TopicIntelligence>();
  private tabsEl: HTMLElement | null = null;

  constructor() {
    super({
      id: 'gdelt-intel',
      title: t('panels.gdeltIntel'),
      showCount: true,
      trackActivity: true,
      infoTooltip: t('components.gdeltIntel.infoTooltip'),
    });
    this.createTabs();
    this.loadActiveTopic();
  }

  private createTabs(): void {
    this.tabsEl = h('div', { className: 'panel-tabs' },
      ...getIntelTopics().map(topic =>
        h('button', {
          className: `panel-tab ${topic.id === this.activeTopic.id ? 'active' : ''}`,
          dataset: { topicId: topic.id },
          title: topic.description,
          onClick: () => this.selectTopic(topic),
        },
          h('span', { className: 'tab-icon' }, topic.icon),
          h('span', { className: 'tab-label' }, topic.name),
        ),
      ),
    );

    this.element.insertBefore(this.tabsEl, this.content);
  }

  private selectTopic(topic: IntelTopic): void {
    if (topic.id === this.activeTopic.id) return;

    this.activeTopic = topic;

    this.tabsEl?.querySelectorAll('.panel-tab').forEach(tab => {
      tab.classList.toggle('active', (tab as HTMLElement).dataset.topicId === topic.id);
    });

    const cached = this.topicData.get(topic.id);
    if (cached && Date.now() - cached.fetchedAt.getTime() < 5 * 60 * 1000) {
      this.renderArticles(cached.articles);
    } else {
      this.loadActiveTopic();
    }
  }

  private async loadActiveTopic(): Promise<void> {
    const topic = this.activeTopic;
    this.showLoading();

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await fetchTopicIntelligence(topic);
        if (!this.element?.isConnected) return;
        this.topicData.set(topic.id, data);

        if (topic.id !== this.activeTopic.id) return;

        if (!data.articles?.length && attempt < 2) {
          this.showRetrying(undefined, 15);
          await new Promise(r => setTimeout(r, 15_000));
          if (!this.element?.isConnected || topic.id !== this.activeTopic.id) return;
          continue;
        }

        this.renderArticles(data.articles ?? []);
        this.setCount(data.articles?.length ?? 0);
        return;
      } catch (error) {
        if (this.isAbortError(error)) return;
        if (!this.element?.isConnected || topic.id !== this.activeTopic.id) return;
        console.error(`[GdeltIntelPanel] Load error (attempt ${attempt + 1}):`, error);
        if (attempt < 2) {
          this.showRetrying(undefined, 15);
          await new Promise(r => setTimeout(r, 15_000));
          if (!this.element?.isConnected || topic.id !== this.activeTopic.id) return;
          continue;
        }
        this.showError(t('common.failedIntelFeed'), () => this.loadActiveTopic());
      }
    }
  }

  private renderArticles(articles: GdeltArticle[]): void {
    this.setErrorState(false);
    let displayArticles = articles;
    
    if (articles.length === 0 && import.meta.env.DEV) {
      displayArticles = this.getMockArticles();
    }
    
    if (displayArticles.length === 0) {
      replaceChildren(this.content, h('div', { className: 'empty-state' }, t('components.gdelt.empty')));
      return;
    }

    replaceChildren(this.content,
      h('div', { className: 'gdelt-intel-articles' },
        ...displayArticles.map(article => this.buildArticle(article)),
      ),
    );
  }

  private getMockArticles(): GdeltArticle[] {
    const now = new Date();
    const formatDate = (hoursAgo: number) => {
      const d = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
      return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '').replace('T', 'T');
    };
    
    const topicMocks: Record<string, GdeltArticle[]> = {
      military: [
        { title: 'NATO conducts joint exercises in Baltic region amid heightened tensions', url: '#', source: 'Defense News', date: formatDate(1), tone: -1 },
        { title: 'New satellite imagery reveals military buildup near contested border', url: '#', source: 'Reuters', date: formatDate(3), tone: -2 },
        { title: 'Air defense systems deployed to protect critical infrastructure', url: '#', source: 'Jane\'s Defence', date: formatDate(5), tone: -1 },
      ],
      cyber: [
        { title: 'Critical zero-day vulnerability discovered in enterprise VPN software', url: '#', source: 'SecurityWeek', date: formatDate(1), tone: -3 },
        { title: 'State-sponsored hackers target energy sector with new malware strain', url: '#', source: 'Dark Reading', date: formatDate(2), tone: -2 },
        { title: 'Ransomware group claims attack on major healthcare provider', url: '#', source: 'BleepingComputer', date: formatDate(4), tone: -3 },
      ],
      nuclear: [
        { title: 'IAEA reports increased enrichment activity at monitored facilities', url: '#', source: 'AP News', date: formatDate(2), tone: -2 },
        { title: 'Nuclear submarine fleet conducts routine patrol in Arctic waters', url: '#', source: 'Naval News', date: formatDate(6), tone: -1 },
      ],
      sanctions: [
        { title: 'New sanctions package targets financial networks and shell companies', url: '#', source: 'Bloomberg', date: formatDate(1), tone: -1 },
        { title: 'Treasury designates entities involved in sanctions evasion schemes', url: '#', source: 'Reuters', date: formatDate(4), tone: -1 },
      ],
      intelligence: [
        { title: 'Intelligence agencies warn of increased cyber espionage activity', url: '#', source: 'The Guardian', date: formatDate(2), tone: -2 },
        { title: 'New report details foreign influence operations targeting elections', url: '#', source: 'BBC', date: formatDate(5), tone: -2 },
      ],
      maritime: [
        { title: 'Naval patrols increased in strategic shipping lanes', url: '#', source: 'Lloyd\'s List', date: formatDate(1), tone: -1 },
        { title: 'Coast guard intercepts suspicious vessel near territorial waters', url: '#', source: 'Maritime Executive', date: formatDate(3), tone: -1 },
      ],
    };
    return topicMocks[this.activeTopic.id] || topicMocks.cyber || [];
  }

  private buildArticle(article: GdeltArticle): HTMLElement {
    const domain = article.source || extractDomain(article.url);
    const timeAgo = formatArticleDate(article.date);
    const toneClass = article.tone ? (article.tone < -2 ? 'tone-negative' : article.tone > 2 ? 'tone-positive' : '') : '';

    return h('a', {
      href: sanitizeUrl(article.url),
      target: '_blank',
      rel: 'noopener',
      className: `gdelt-intel-article ${toneClass}`.trim(),
    },
      h('div', { className: 'article-header' },
        h('span', { className: 'article-source' }, domain),
        h('span', { className: 'article-time' }, timeAgo),
      ),
      h('div', { className: 'article-title' }, article.title),
    );
  }

  public async refresh(): Promise<void> {
    await this.loadActiveTopic();
  }

  public async refreshAll(): Promise<void> {
    this.topicData.clear();
    await this.loadActiveTopic();
  }
}
