// In-page computed-geometry extraction for the visual acceptance harness.
// The function below is serialised and evaluated inside Chrome, so it must stay
// self-contained. It reports COMPUTED browser values, never CSS source text.
export const METRICS_SCHEMA = 'html-share.visual.metrics/1';

/**
 * Mirrors the in-page `pick()` helper's comma-separated-selector fallback
 * algorithm — first selector in the list an element is found (and, in-page,
 * visible) for wins; none matching is a genuine absence. `extractVisualMetrics`
 * below keeps its own inline copy because it must stay one self-contained
 * string for browser evaluation (see the assertion in
 * test/visual-harness.test.ts that no import/require leaks into it); this
 * export exists so the ALGORITHM — not real DOM matching, which requires a
 * browser — is unit-testable in Node against a fake matcher.
 */
export function firstMatchingSelector(selectorList, isPresent) {
  if (!selectorList) return null;
  for (const raw of selectorList.split(',')) {
    const selector = raw.trim();
    if (selector && isPresent(selector)) return selector;
  }
  return null;
}

function extractVisualMetrics(options) {
  var round = function (value) { return Math.round(value * 10) / 10; };
  var rect = function (element) {
    if (!element) return null;
    var box = element.getBoundingClientRect();
    return { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) };
  };
  var visible = function (element) {
    if (!element) return false;
    var style = element.ownerDocument.defaultView.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    var box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  var selectorOf = function (element) {
    if (!element) return null;
    var token = element.tagName.toLowerCase();
    if (element.id) return token + '#' + element.id;
    var classes = (element.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
    return classes.length ? token + '.' + classes.join('.') : token;
  };
  var textOf = function (element) {
    return (element && element.textContent ? element.textContent : '').replace(/\s+/g, ' ').trim();
  };
  var ownText = function (element) {
    var value = '';
    for (var i = 0; i < element.childNodes.length; i += 1) {
      if (element.childNodes[i].nodeType === 3) value += element.childNodes[i].nodeValue;
    }
    return value.replace(/\s+/g, ' ').trim();
  };

  // ---- document resolution -------------------------------------------------
  var shellDocument = document;
  var frame = options.probes.contentFrame ? document.querySelector(options.probes.contentFrame) : null;
  var contentDocument = frame && frame.contentDocument ? frame.contentDocument : document;
  var frameBox = frame ? frame.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };
  var frameOffset = { x: frame ? round(frameBox.x) : 0, y: frame ? round(frameBox.y) : 0 };
  // Composed coordinates: content-document coordinates translated into the outer
  // viewport, so prototype and current are measured on one common frame.
  var composed = function (element) {
    var box = rect(element);
    if (!box) return null;
    if (element.ownerDocument === shellDocument) return box;
    return { x: round(box.x + frameOffset.x), y: round(box.y + frameOffset.y), width: box.width, height: box.height };
  };
  var pick = function (doc, selector) {
    if (!selector) return null;
    var list = selector.split(',');
    for (var i = 0; i < list.length; i += 1) {
      var found = null;
      try { found = doc.querySelector(list[i].trim()); } catch (error) { found = null; }
      if (found && visible(found)) return found;
    }
    return null;
  };

  var view = shellDocument.defaultView;
  var viewport = { width: view.innerWidth, height: view.innerHeight };

  // ---- shell ---------------------------------------------------------------
  var describeChrome = function (element) {
    if (!element) return { present: false };
    var style = element.ownerDocument.defaultView.getComputedStyle(element);
    var box = composed(element);
    return {
      present: true,
      selector: selectorOf(element),
      x: box.x, y: box.y, width: box.width, height: box.height,
      position: style.position,
      itemCount: element.querySelectorAll('a,button').length,
    };
  };
  // The persistent global chrome plays different roles per side and per width:
  // a left rail on desktop, a top bar on mobile. It is measured as one role and
  // its orientation is derived, so the two sides stay comparable.
  var describeGlobalChrome = function (element) {
    var described = describeChrome(element);
    if (!described.present) return described;
    described.orientation = described.height > described.width ? 'vertical-rail' : 'horizontal-bar';
    described.occupiesLeftGutter = described.x <= 1 && described.height > viewport.height * 0.6;
    return described;
  };
  var globalChromeElement = pick(shellDocument, options.probes.globalChrome);
  var railElement = pick(shellDocument, options.probes.rail);
  var headerElement = pick(shellDocument, options.probes.header);
  var globalNavElement = pick(shellDocument, options.probes.globalNav);
  var domainNavElement = pick(shellDocument, options.probes.domainNav);
  var utilityElement = pick(shellDocument, options.probes.utility);

  // ---- principal container -------------------------------------------------
  var principal = pick(contentDocument, options.probes.main)
    || contentDocument.querySelector('main')
    || contentDocument.body;

  // Unwrap single-child layout wrappers so both sides are measured at the same
  // level: the element whose children ARE the page's major sections.
  var visibleChildren = function (element) {
    var kids = [];
    for (var i = 0; i < element.children.length; i += 1) if (visible(element.children[i])) kids.push(element.children[i]);
    return kids;
  };
  var pageWrapper = principal;
  for (var unwrap = 0; unwrap < 4; unwrap += 1) {
    var kids = visibleChildren(pageWrapper);
    if (kids.length !== 1) break;
    if (kids[0].getBoundingClientRect().height < pageWrapper.getBoundingClientRect().height * 0.9) break;
    pageWrapper = kids[0];
  }

  var textBearing = [];
  var walker = contentDocument.createTreeWalker(principal, NodeFilter.SHOW_ELEMENT);
  var node = principal;
  while (node) {
    if (ownText(node).length > 0 && visible(node)) textBearing.push(node);
    node = walker.nextNode();
  }

  var firstContent = null;
  for (var t = 0; t < textBearing.length; t += 1) {
    var candidateBox = composed(textBearing[t]);
    if (candidateBox && candidateBox.height > 0) {
      if (!firstContent || candidateBox.y < firstContent.y) firstContent = candidateBox;
    }
  }

  // ---- typography ----------------------------------------------------------
  var typographyOf = function (element) {
    if (!element) return null;
    var style = element.ownerDocument.defaultView.getComputedStyle(element);
    return {
      selector: selectorOf(element),
      fontSize: round(parseFloat(style.fontSize)),
      lineHeight: style.lineHeight === 'normal' ? 'normal' : round(parseFloat(style.lineHeight)),
      fontWeight: style.fontWeight,
      fontFamily: style.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
    };
  };
  var firstIn = function (selector) {
    var found = principal.querySelectorAll(selector);
    for (var i = 0; i < found.length; i += 1) if (visible(found[i])) return found[i];
    return null;
  };
  var sizeHistogram = {};
  for (var s = 0; s < textBearing.length; s += 1) {
    var size = round(parseFloat(contentDocument.defaultView.getComputedStyle(textBearing[s]).fontSize));
    sizeHistogram[size] = (sizeHistogram[size] || 0) + 1;
  }
  var sizes = Object.keys(sizeHistogram).map(Number).sort(function (a, b) { return a - b; });
  // "meta / secondary text" is defined structurally as the smallest font size
  // carrying at least three visible text nodes, so both sides are measured by the
  // same rule rather than by a hand-picked per-side selector.
  var metaSize = null;
  for (var m = 0; m < sizes.length; m += 1) { if (sizeHistogram[sizes[m]] >= 3) { metaSize = sizes[m]; break; } }
  var bodySize = null; var bodyCount = -1;
  for (var b = 0; b < sizes.length; b += 1) {
    if (sizeHistogram[sizes[b]] > bodyCount) { bodyCount = sizeHistogram[sizes[b]]; bodySize = sizes[b]; }
  }

  // ---- column bands --------------------------------------------------------
  var bands = [];
  var containerWidth = pageWrapper.getBoundingClientRect().width || 1;
  var candidates = [pageWrapper].concat(Array.prototype.slice.call(pageWrapper.querySelectorAll('*')));
  for (var i2 = 0; i2 < candidates.length; i2 += 1) {
    var element = candidates[i2];
    if (!visible(element)) continue;
    var style2 = contentDocument.defaultView.getComputedStyle(element);
    if (style2.display.indexOf('grid') < 0 && style2.display.indexOf('flex') < 0) continue;
    var children = [];
    for (var ch = 0; ch < element.children.length; ch += 1) {
      if (visible(element.children[ch])) children.push(element.children[ch]);
    }
    if (children.length < 2) continue;
    var top = children[0].getBoundingClientRect().top;
    var row = children.filter(function (child) { return Math.abs(child.getBoundingClientRect().top - top) <= 24; });
    if (row.length < 2) continue;
    var widths = row.map(function (child) { return round(child.getBoundingClientRect().width); });
    var span = widths.reduce(function (a, v) { return a + v; }, 0);
    var elementWidth = element.getBoundingClientRect().width || 1;
    if (span < elementWidth * 0.6) continue;
    if (elementWidth < containerWidth * 0.5) continue;
    var depth = 0;
    for (var walkUp = element; walkUp && walkUp !== pageWrapper; walkUp = walkUp.parentElement) depth += 1;
    bands.push({
      selector: selectorOf(element),
      depth: depth,
      inChrome: !!element.closest('header, nav'),
      y: round(element.getBoundingClientRect().top + frameOffset.y),
      width: round(elementWidth),
      height: round(element.getBoundingClientRect().height),
      columnCount: row.length,
      columnWidths: widths,
      columnRatios: widths.map(function (w) { return round((w / span) * 100); }),
      gridTemplateColumns: style2.gridTemplateColumns === 'none' ? null : style2.gridTemplateColumns,
    });
  }
  bands.sort(function (a, b2) { return a.y - b2.y; });
  // The principal band is the page's own first multi-column row: a direct child
  // of the page wrapper, substantial enough to be a layout band rather than a
  // toolbar, and not page-header or navigation chrome. Restricting it to depth 1
  // is what keeps it a PAGE layout metric instead of picking up a two-column
  // grid nested inside some card.
  var principalBand = null;
  for (var pbi = 0; pbi < bands.length; pbi += 1) {
    if (bands[pbi].depth !== 1) continue;
    if (bands[pbi].inChrome) continue;
    if (bands[pbi].height < 80) continue;
    principalBand = bands[pbi];
    break;
  }
  // Routes that group their content (feed batches, library regions) put the real
  // card grid one or two levels below the page band. The content band is the
  // largest such grid, so both the page composition and the repeating content
  // layout can be contracted independently.
  var contentBand = null;
  for (var cbi = 0; cbi < bands.length; cbi += 1) {
    var band = bands[cbi];
    if (band.depth > 3 || band.inChrome || band.height < 80) continue;
    if (!contentBand || band.width * band.height > contentBand.width * contentBand.height) contentBand = band;
  }

  // ---- section order -------------------------------------------------------
  // Major sections are the direct children of the unwrapped page wrapper. That
  // definition holds whether a side uses <section> elements or plain divs, so
  // the two implementations stay comparable.
  // Page-level chrome (the page title header and the domain tab bar) is measured
  // through the shell probes, not as content. Leaving it in the section list lets
  // a page title match a content matcher and corrupts the order comparison.
  var isPageChrome = function (element) {
    if (/^(header|nav)$/i.test(element.tagName)) return true;
    return /page-head|page-header|workspace-tabs|domain-nav/i.test(element.getAttribute('class') || '');
  };
  var allChildren = visibleChildren(pageWrapper);
  var sectionNodes = [];
  var chromeSections = [];
  for (var sc = 0; sc < allChildren.length; sc += 1) {
    if (isPageChrome(allChildren[sc])) chromeSections.push(selectorOf(allChildren[sc]));
    else sectionNodes.push(allChildren[sc]);
  }
  var headingFor = function (element3) {
    var shallow = element3.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4');
    if (shallow) return textOf(shallow);
    var banner = element3.querySelector(':scope > header, :scope > .section-head, :scope > .sec-head, :scope > .v5-section-header, :scope > .v5-page-header');
    if (banner) return textOf(banner).slice(0, 80);
    var previous = element3.previousElementSibling;
    if (previous && /^h[1-4]$/i.test(previous.tagName)) return textOf(previous);
    if (previous && /head/i.test(previous.getAttribute('class') || '')) return textOf(previous).slice(0, 80);
    var deep = element3.querySelector('h1, h2, h3, h4');
    if (deep) return textOf(deep);
    return textOf(element3).slice(0, 60);
  };
  var sections = sectionNodes.map(function (element3, order) {
    var box2 = composed(element3);
    return {
      index: order,
      tag: element3.tagName.toLowerCase(),
      selector: selectorOf(element3),
      classList: (element3.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean),
      heading: headingFor(element3).slice(0, 80),
      y: box2 ? box2.y : null,
      height: box2 ? box2.height : null,
      inFirstFold: box2 ? box2.y < viewport.height : false,
    };
  });

  // ---- overflow / clipping -------------------------------------------------
  var docElement = contentDocument.documentElement;
  var overflowing = [];
  var scan = principal.querySelectorAll('*');
  for (var o = 0; o < scan.length; o += 1) {
    var element4 = scan[o];
    if (!visible(element4)) continue;
    var box3 = element4.getBoundingClientRect();
    var overflowX = element4.scrollWidth - element4.clientWidth;
    var beyond = round(box3.right + frameOffset.x - viewport.width);
    if ((overflowX > 4 && element4.clientWidth > 0) || beyond > 4) {
      var scrollableAncestor = false;
      for (var up = element4.parentElement; up && up !== contentDocument.documentElement; up = up.parentElement) {
        var upStyle = contentDocument.defaultView.getComputedStyle(up);
        if (upStyle.overflowX === 'auto' || upStyle.overflowX === 'scroll') { scrollableAncestor = true; break; }
      }
      overflowing.push({
        selector: selectorOf(element4),
        scrollableAncestor: scrollableAncestor,
        scrollWidth: element4.scrollWidth,
        clientWidth: element4.clientWidth,
        overflowX: overflowX,
        beyondViewportPx: beyond,
        overflowStyle: contentDocument.defaultView.getComputedStyle(element4).overflowX,
      });
    }
  }
  overflowing.sort(function (a, b4) { return b4.beyondViewportPx - a.beyondViewportPx; });

  // ---- first-fold density --------------------------------------------------
  var foldChars = 0; var foldElements = 0; var foldInteractive = 0;
  for (var f = 0; f < textBearing.length; f += 1) {
    var box4 = composed(textBearing[f]);
    if (!box4 || box4.y >= viewport.height) continue;
    foldElements += 1;
    foldChars += ownText(textBearing[f]).length;
  }
  var interactive = principal.querySelectorAll('a,button,input,select,textarea,[tabindex]');
  for (var n2 = 0; n2 < interactive.length; n2 += 1) {
    var box5 = composed(interactive[n2]);
    if (box5 && box5.y < viewport.height && visible(interactive[n2])) foldInteractive += 1;
  }

  // ---- domain grammar probes ----------------------------------------------
  var stickyCount = 0; var stickySelectors = [];
  var positioned = principal.querySelectorAll('*');
  for (var k = 0; k < positioned.length; k += 1) {
    if (!visible(positioned[k])) continue;
    var pos = contentDocument.defaultView.getComputedStyle(positioned[k]).position;
    if (pos === 'sticky') { stickyCount += 1; if (stickySelectors.length < 8) stickySelectors.push(selectorOf(positioned[k])); }
  }
  var tables = [];
  var tableNodes = principal.querySelectorAll('table');
  for (var tt = 0; tt < tableNodes.length; tt += 1) {
    if (!visible(tableNodes[tt])) continue;
    var tableBox = tableNodes[tt].getBoundingClientRect();
    var firstRow = tableNodes[tt].querySelector('tr');
    var wrapped = false;
    for (var tw = tableNodes[tt].parentElement; tw && tw !== contentDocument.documentElement; tw = tw.parentElement) {
      var twStyle = contentDocument.defaultView.getComputedStyle(tw);
      if (twStyle.overflowX === 'auto' || twStyle.overflowX === 'scroll') { wrapped = true; break; }
    }
    tables.push({
      selector: selectorOf(tableNodes[tt]),
      inScrollContainer: wrapped,
      columnCount: tableNodes[tt].querySelectorAll('thead th').length || (firstRow ? firstRow.children.length : 0),
      rowCount: tableNodes[tt].querySelectorAll('tbody tr').length,
      width: round(tableBox.width),
      scrollWidth: tableNodes[tt].scrollWidth,
      overflowsViewport: round(tableBox.right + frameOffset.x) > viewport.width + 4,
    });
  }
  var classHistogram = {};
  var classed = contentDocument.querySelectorAll('[class]');
  for (var cl = 0; cl < classed.length; cl += 1) {
    var tokens = (classed[cl].getAttribute('class') || '').trim().split(/\s+/);
    for (var tk = 0; tk < tokens.length; tk += 1) {
      if (!tokens[tk]) continue;
      classHistogram[tokens[tk]] = (classHistogram[tokens[tk]] || 0) + 1;
    }
  }
  // Quantitative visual encoding, counted independently of the technique used.
  // The Prototype draws its allocation donut with an inline conic-gradient and
  // its P/L bars with percentage custom properties, so an SVG/canvas count alone
  // would report zero charts on the very routes that are most chart-driven.
  var proportionalBars = 0;
  var quantitativeVisuals = 0;
  var styled = principal.querySelectorAll('[style]');
  for (var pb = 0; pb < styled.length; pb += 1) {
    var inline = styled[pb].getAttribute('style') || '';
    if (/width:\s*\d+(\.\d+)?%/.test(inline)) proportionalBars += 1;
    if (/(--[\w-]+\s*:\s*[^;]*\d+(\.\d+)?%)|(width:\s*\d+(\.\d+)?%)|conic-gradient/.test(inline)) quantitativeVisuals += 1;
  }
  var painted = principal.querySelectorAll('*');
  for (var qv = 0; qv < painted.length; qv += 1) {
    if (!visible(painted[qv])) continue;
    var image = contentDocument.defaultView.getComputedStyle(painted[qv]).backgroundImage;
    if (image && image.indexOf('conic-gradient') >= 0) quantitativeVisuals += 1;
  }
  quantitativeVisuals += principal.querySelectorAll('svg, canvas, meter, progress').length;

  var principalBox = composed(pageWrapper);
  var principalStyle = contentDocument.defaultView.getComputedStyle(pageWrapper);
  // Content-box width: the width real content actually occupies, independent of
  // how each side distributes padding between wrapper and page.
  var principalContentWidth = round(pageWrapper.clientWidth
    - parseFloat(principalStyle.paddingLeft) - parseFloat(principalStyle.paddingRight));

  return {
    schema: options.schema,
    destination_id: options.destinationId,
    side: options.side,
    viewport: { width: viewport.width, height: viewport.height },
    shell: {
      globalChrome: describeGlobalChrome(globalChromeElement),
      rail: describeChrome(railElement),
      header: describeChrome(headerElement),
      globalNavigation: describeChrome(globalNavElement),
      domainNavigation: describeChrome(domainNavElement),
      utilityActions: describeChrome(utilityElement),
      contentViewport: frame
        ? { x: frameOffset.x, y: frameOffset.y, width: round(frameBox.width), height: round(frameBox.height) }
        : { x: 0, y: 0, width: viewport.width, height: viewport.height },
      firstContentY: firstContent ? firstContent.y : null,
    },
    typography: {
      body: typographyOf(contentDocument.body),
      h1: typographyOf(firstIn('h1')),
      h2: typographyOf(firstIn('h2')),
      h3: typographyOf(firstIn('h3')),
      tableBody: typographyOf(firstIn('tbody td, td')),
      meta: metaSize === null ? null : { fontSize: metaSize, count: sizeHistogram[metaSize] },
      dominantBodySize: bodySize,
      sizeHistogram: sizeHistogram,
    },
    main: {
      principalContainer: {
        selector: selectorOf(pageWrapper),
        mainSelector: selectorOf(principal),
        x: principalBox.x, y: principalBox.y, width: principalBox.width, height: principalBox.height,
        contentWidth: principalContentWidth,
        maxWidth: principalStyle.maxWidth,
        paddingLeft: principalStyle.paddingLeft,
        paddingRight: principalStyle.paddingRight,
      },
      primaryContentTop: firstContent ? firstContent.y : null,
      principalBandSelector: principalBand ? principalBand.selector : null,
      columnCount: principalBand ? principalBand.columnCount : 1,
      columnWidths: principalBand ? principalBand.columnWidths : [],
      columnRatios: principalBand ? principalBand.columnRatios : [100],
      contentBandSelector: contentBand ? contentBand.selector : null,
      contentColumnCount: contentBand ? contentBand.columnCount : 1,
      contentColumnRatios: contentBand ? contentBand.columnRatios : [100],
      columnBands: bands.slice(0, 10),
      chromeSections: chromeSections,
      sectionOrder: sections,
      documentScrollWidth: docElement.scrollWidth,
      documentClientWidth: docElement.clientWidth,
      documentScrollHeight: docElement.scrollHeight,
      horizontalOverflowPx: Math.max(0, docElement.scrollWidth - docElement.clientWidth),
      overflowingElements: overflowing.slice(0, 10),
      firstFoldDensity: {
        textChars: foldChars,
        textElements: foldElements,
        interactiveElements: foldInteractive,
        foldArea: viewport.width * viewport.height,
        charsPerMegapixel: round((foldChars / (viewport.width * viewport.height)) * 1000000),
      },
    },
    grammar: {
      tables: tables,
      stickyElementCount: stickyCount,
      stickySelectors: stickySelectors,
      svgCount: principal.querySelectorAll('svg').length,
      canvasCount: principal.querySelectorAll('canvas').length,
      proportionalBarCount: proportionalBars,
      quantitativeVisualCount: quantitativeVisuals,
      listCount: principal.querySelectorAll('ul,ol').length,
      headingCounts: {
        h1: principal.querySelectorAll('h1').length,
        h2: principal.querySelectorAll('h2').length,
        h3: principal.querySelectorAll('h3').length,
      },
      classHistogram: classHistogram,
    },
  };
}

export const METRICS_SOURCE = extractVisualMetrics.toString();

export function metricsExpression(options) {
  return `(${METRICS_SOURCE})(${JSON.stringify({ ...options, schema: METRICS_SCHEMA })})`;
}
