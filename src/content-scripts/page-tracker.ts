import type { PageData, PageInteractions, TextSelection } from "@/types/page";

// Track page interactions and send to background
interface FocusedSection {
  heading: string;
  timeSpent: number;
  scrollStart: number;
  scrollEnd: number;
  textSelections: number;
}

class PageTracker {
  private startTime = Date.now();
  private maxScrollY = 0;
  private totalScrollDistance = 0;
  private lastScrollY = 0;
  private textSelections: TextSelection[] = [];
  private intervalId: number | null = null;
  private contextValid = true;

  // Section tracking
  private focusedSections: Map<string, FocusedSection> = new Map();
  private currentSection: string | null = null;
  private sectionStartTime: number = 0;
  private intersectionObserver: IntersectionObserver | null = null;

  constructor() {
    this.init();
  }

  private init() {
    // Track scroll
    window.addEventListener("scroll", this.handleScroll.bind(this), {
      passive: true,
    });

    // Track text selection
    document.addEventListener("mouseup", this.handleTextSelection.bind(this));

    // Setup section tracking after page loads
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        this.setupSectionTracking();
      });
    } else {
      this.setupSectionTracking();
    }

    // Send data ONCE when leaving page (final update only)
    // CRITICAL: Must wrap in try-catch - context may be invalidated
    window.addEventListener("beforeunload", () => {
      try {
        this.finalizeCurrentSection();
        this.sendData();
      } catch (error) {
        // Extension context invalidated - silently ignore
        // This is expected when extension reloads during browsing
      } finally {
        this.cleanup();
      }
    });

    // Send initial data after 15 seconds (sufficient time for interaction tracking)
    // Only send ONCE to avoid duplicates in fast tests
    setTimeout(() => {
      try {
        this.finalizeCurrentSection();
        this.sendData();
        this.cleanup(); // Stop further sends after first one
      } catch (error) {
        // Extension context might be invalid
      }
    }, 15000);
  }

  private setupSectionTracking() {
    // Find all headings
    const headings = document.querySelectorAll("h1, h2, h3");

    if (headings.length === 0) return;

    // Setup intersection observer
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const heading =
            (entry.target as HTMLElement).textContent?.trim() || "";

          if (entry.isIntersecting) {
            // Entering section
            this.enterSection(heading);
          } else if (this.currentSection === heading) {
            // Leaving section
            this.leaveSection(heading);
          }
        });
      },
      { threshold: 0.5 }
    );

    // Observe all headings
    headings.forEach((h) => this.intersectionObserver!.observe(h));
  }

  private enterSection(heading: string) {
    if (!heading) return;

    // Leave previous section if any
    if (this.currentSection && this.currentSection !== heading) {
      this.leaveSection(this.currentSection);
    }

    this.currentSection = heading;
    this.sectionStartTime = Date.now();

    if (!this.focusedSections.has(heading)) {
      this.focusedSections.set(heading, {
        heading,
        timeSpent: 0,
        scrollStart: this.getScrollPercentage(),
        scrollEnd: this.getScrollPercentage(),
        textSelections: 0,
      });
    }
  }

  private leaveSection(heading: string) {
    if (!this.sectionStartTime || !heading) return;

    const section = this.focusedSections.get(heading);
    if (section) {
      section.timeSpent += Date.now() - this.sectionStartTime;
      section.scrollEnd = this.getScrollPercentage();
    }

    this.currentSection = null;
    this.sectionStartTime = 0;
  }

  private finalizeCurrentSection() {
    if (this.currentSection) {
      this.leaveSection(this.currentSection);
    }
  }

  private cleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.contextValid = false;
  }

  private handleScroll() {
    const scrollY = window.scrollY;
    this.maxScrollY = Math.max(this.maxScrollY, scrollY);
    this.totalScrollDistance += Math.abs(scrollY - this.lastScrollY);
    this.lastScrollY = scrollY;
  }

  private handleTextSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (text.length < 10) return; // Ignore short selections

    // Find nearest heading
    let nearestHeading = "";
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    let element =
      container.nodeType === Node.ELEMENT_NODE
        ? (container as Element)
        : container.parentElement;

    while (element && element !== document.body) {
      const heading = element.querySelector("h1, h2, h3, h4, h5, h6");
      if (heading) {
        nearestHeading = heading.textContent?.trim() || "";
        break;
      }
      element = element.parentElement;
    }

    const scrollPercentage = this.getScrollPercentage();

    // Track in current section
    if (this.currentSection) {
      const section = this.focusedSections.get(this.currentSection);
      if (section) {
        section.textSelections++;
      }
    }

    this.textSelections.push({
      text: text.substring(0, 200), // Limit length
      length: text.length,
      timestamp: Date.now(),
      nearestHeading,
      scrollPercentage,
    });
  }

  private getScrollPercentage(): number {
    const scrollHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    return scrollHeight > 0
      ? Math.round((window.scrollY / scrollHeight) * 100)
      : 0;
  }

  private calculateEngagementScore(): number {
    const dwellTime = Date.now() - this.startTime;
    const scrollDepth = this.getScrollPercentage();
    const selections = this.textSelections.length;

    // Scoring components
    const dwellScore = Math.min(dwellTime / 60000, 1); // Max at 1 minute
    const scrollScore = scrollDepth / 100;
    const selectionScore = Math.min(selections / 3, 1); // Max at 3 selections

    // Weighted combination
    const engagement =
      dwellScore * 0.4 + scrollScore * 0.3 + selectionScore * 0.3;

    return Math.min(Math.max(engagement, 0), 1);
  }

  private sendData() {
    // Quick check if we've already detected invalid context
    if (!this.contextValid) {
      return;
    }

    // NO FILTERING - Track ALL pages and let AI decide their value

    // Wrap entire function to catch context invalidation errors
    try {
      // Check if extension context is still valid
      // This check itself can throw if context is invalidated
      if (!chrome?.runtime?.id) {
        this.cleanup();
        return;
      }

      const dwellTime = Date.now() - this.startTime;
      const scrollDepth = this.getScrollPercentage();

      const interactions: PageInteractions = {
        dwellTime,
        scrollDepth,
        scrollPosition: window.scrollY,
        totalScrollDistance: this.totalScrollDistance,
        textSelections: this.textSelections,
        engagementScore: this.calculateEngagementScore(),
        focusedSections: Array.from(this.focusedSections.values())
          .filter((s) => s.timeSpent > 5000) // Only sections with 5+ seconds
          .sort((a, b) => b.timeSpent - a.timeSpent) // Sort by time spent
          .slice(0, 5), // Top 5 sections
      };

      // Collect rich metadata for AI
      const bodyText = document.body?.textContent?.trim() || "";
      const title = document.title.toLowerCase();

      const pageData: Partial<PageData> = {
        url: window.location.href,
        title: document.title,
        timestamp: this.startTime,
        content: this.extractContent(),
        contentSize: document.documentElement.innerHTML.length,
        metadata: {
          domain: window.location.hostname,
          lang: document.documentElement.lang || "en",
          referrer: document.referrer,

          // Rich metadata for AI inference
          canonical:
            document
              .querySelector('link[rel="canonical"]')
              ?.getAttribute("href") || undefined,
          description:
            document
              .querySelector('meta[name="description"]')
              ?.getAttribute("content") || undefined,
          keywords:
            document
              .querySelector('meta[name="keywords"]')
              ?.getAttribute("content") || undefined,
          ogTitle:
            document
              .querySelector('meta[property="og:title"]')
              ?.getAttribute("content") || undefined,
          ogDescription:
            document
              .querySelector('meta[property="og:description"]')
              ?.getAttribute("content") || undefined,
          ogType:
            document
              .querySelector('meta[property="og:type"]')
              ?.getAttribute("content") || undefined,

          // Page characteristics (observations for AI)
          titleContains404:
            title.includes("404") || title.includes("not found"),
          titleContainsError: title.includes("error"),
          bodyTextLength: bodyText.length,
          hasNavigation: !!document.querySelector("nav"),
          headingCount: document.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
          linkCount: document.querySelectorAll("a").length,
        },
        interactions,
      };

      // Send to background with error handling
      chrome.runtime.sendMessage(
        {
          type: "PAGE_DATA",
          data: pageData,
        },
        (_response) => {
          // CRITICAL: This callback runs async, needs its own try-catch
          try {
            if (chrome.runtime.lastError) {
              const error = chrome.runtime.lastError.message;
              if (error && !error.includes("Extension context invalidated")) {
                console.warn("PageTracker: Message send failed:", error);
              }
            }
          } catch (error) {
            // Accessing chrome.runtime.lastError can throw if context invalidated
            // Silently ignore - expected when extension reloads
          }
        }
      );
    } catch (error) {
      // Extension context invalidated or other error
      if (error instanceof Error) {
        if (error.message.includes("Extension context invalidated")) {
          // Stop all tracking - context is gone
          this.cleanup();
        } else {
          console.log("PageTracker: Error:", error.message);
        }
      }
    }
  }

  private extractContent(): string {
    // Extract main content, stripping scripts and styles
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll("script, style, noscript, iframe")
      .forEach((el) => el.remove());

    let content = clone.textContent || "";

    // For sparse content pages, enrich with metadata for AI inference
    if (content.trim().length < 500) {
      const enrichments = [];

      // URL path contains intent signals
      enrichments.push(`URL_PATH: ${window.location.pathname}`);

      // Meta tags
      const metaDesc = document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content");
      if (metaDesc) enrichments.push(`META_DESC: ${metaDesc}`);

      const metaKeys = document
        .querySelector('meta[name="keywords"]')
        ?.getAttribute("content");
      if (metaKeys) enrichments.push(`META_KEYWORDS: ${metaKeys}`);

      // All headings (page structure)
      const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
        .map((h) => h.textContent?.trim())
        .filter(Boolean)
        .join(" | ");
      if (headings) enrichments.push(`HEADINGS: ${headings}`);

      // Navigation text (site context)
      const nav = document.querySelector("nav")?.textContent?.trim();
      if (nav) enrichments.push(`NAV: ${nav.substring(0, 200)}`);

      // Visible links (user options)
      const links = Array.from(document.querySelectorAll("a"))
        .map((a) => a.textContent?.trim())
        .filter(Boolean)
        .slice(0, 15)
        .join(", ");
      if (links) enrichments.push(`LINKS: ${links}`);

      content = [content, ...enrichments].filter(Boolean).join("\n\n");
    }

    return content.replace(/\s+/g, " ").trim().substring(0, 50000);
  }
}

// Initialize tracker
new PageTracker();
