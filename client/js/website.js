/**
 * Mumble AI — Website Interactive Behaviors
 * Handles live demo switching, pricing toggle, FAQ accordion, and smooth interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
  initHeroPreview();
  initPricingToggle();
  initFaqAccordion();
  initMobileMenu();
});

/* ----------------------------------------------------
   1. HERO PREVIEW INTERACTIVE DEMO
   ---------------------------------------------------- */
const DEMO_SCENARIOS = {
  cursor: {
    title: 'Cursor / VS Code',
    raw: '"hey define a typescript interface for user session with token string expires at number and optional workspace id"',
    formatted: `interface UserSession {
  token: string;
  expiresAt: number;
  workspaceId?: string;
}`
  },
  slack: {
    title: 'Slack / Teams',
    raw: '"hey alex deploying the auth middleware fix now lets run regression tests together at 3pm"',
    formatted: `Hey Alex, deploying the auth middleware fix now! Let's run regression tests together at 3:00 PM.`
  },
  terminal: {
    title: 'Terminal / CLI',
    raw: '"git checkout new branch feature slash model hub and push origin head"',
    formatted: `git checkout -b feature/model-hub && git push -u origin HEAD`
  },
  email: {
    title: 'Gmail / Executive',
    raw: '"thanks for meeting today we reviewed the enterprise sla and will provide the soc2 report by friday"',
    formatted: `Hi Sarah,

Thank you for meeting today. We reviewed the enterprise SLA requirements and will provide the SOC 2 compliance report by Friday.

Best regards,
Mumble Engineering`
  }
};

function initHeroPreview() {
  const tabs = document.querySelectorAll('.app-pill-tab');
  const rawElem = document.getElementById('heroRawStream');
  const formattedElem = document.getElementById('heroFormattedCode');

  if (!tabs.length || !rawElem || !formattedElem) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-app');
      const data = DEMO_SCENARIOS[target];
      if (!data) return;

      // Update active state
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Animate text transition
      rawElem.style.opacity = '0.3';
      formattedElem.style.opacity = '0.3';

      setTimeout(() => {
        rawElem.textContent = data.raw;
        formattedElem.textContent = data.formatted;
        rawElem.style.opacity = '1';
        formattedElem.style.opacity = '1';
      }, 150);
    });
  });
}

/* ----------------------------------------------------
   2. PRICING BILLING TOGGLE
   ---------------------------------------------------- */
function initPricingToggle() {
  const monthlyBtn = document.getElementById('pricingMonthlyBtn');
  const annualBtn = document.getElementById('pricingAnnualBtn');
  const proPrice = document.getElementById('proPriceAmount');
  const proPeriod = document.getElementById('proPricePeriod');

  if (!monthlyBtn || !annualBtn || !proPrice) return;

  monthlyBtn.addEventListener('click', () => {
    monthlyBtn.classList.add('active');
    annualBtn.classList.remove('active');
    proPrice.textContent = '15';
    if (proPeriod) proPeriod.textContent = '/ user / month billed monthly';
  });

  annualBtn.addEventListener('click', () => {
    annualBtn.classList.add('active');
    monthlyBtn.classList.remove('active');
    proPrice.textContent = '12';
    if (proPeriod) proPeriod.textContent = '/ user / month billed annually';
  });
}

/* ----------------------------------------------------
   3. FAQ ACCORDION
   ---------------------------------------------------- */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const trigger = item.querySelector('.faq-trigger');
    if (!trigger) return;

    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all other items
      faqItems.forEach(i => i.classList.remove('open'));

      // Toggle current
      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });
}

/* ----------------------------------------------------
   4. MOBILE NAVIGATION DRAWER
   ---------------------------------------------------- */
function initMobileMenu() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');

  if (!menuBtn || !navLinks) return;

  menuBtn.addEventListener('click', () => {
    const isExpanded = navLinks.style.display === 'flex';
    if (isExpanded) {
      navLinks.style.display = '';
    } else {
      navLinks.style.display = 'flex';
      navLinks.style.flexDirection = 'column';
      navLinks.style.position = 'absolute';
      navLinks.style.top = '72px';
      navLinks.style.left = '0';
      navLinks.style.right = '0';
      navLinks.style.background = '#ffffeb';
      navLinks.style.padding = '24px';
      navLinks.style.borderBottom = '1px solid #e4e4d0';
      navLinks.style.boxShadow = '0 12px 24px rgba(0,0,0,0.08)';
    }
  });
}
