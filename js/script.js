// ===== MOBILE NAVIGATION =====
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
});

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        hamburger?.classList.remove('active');
        navMenu?.classList.remove('active');
    });
});

// ===== SMOOTH SCROLLING =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offsetTop = target.offsetTop - 80; // Account for fixed navbar
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    });
});

// ===== NAVBAR SCROLL EFFECT =====
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    if (window.scrollY > 100) {
        navbar?.classList.add('scrolled');
    } else {
        navbar?.classList.remove('scrolled');
    }
});

// ===== EMAILJS INITIALIZATION =====
// Initialize EmailJS with your public key
if (typeof emailjs !== 'undefined') {
    emailjs.init('ldFc3kaycY8hJJKhy');
    console.log('✅ EmailJS initialized successfully!');
} else {
    console.error('❌ EmailJS library not loaded!');
}

// ===== FORM HANDLING =====
const contactForm = document.querySelector('.contact-form .form');

if (contactForm) {
    console.log('✅ Contact form found!');
} else {
    console.error('❌ Contact form NOT found!');
}

contactForm?.addEventListener('submit', function (e) {
    e.preventDefault();
    console.log('📧 Form submission started...');

    // Get form data
    const name = this.querySelector('input[type="text"]').value;
    const email = this.querySelector('input[type="email"]').value;
    const phone = this.querySelector('input[type="tel"]').value;
    const service = this.querySelector('select').value;
    const message = this.querySelector('textarea').value;

    // Simple validation
    if (!name || !email || !message) {
        showNotification('Please fill in all required fields.', 'error');
        return;
    }

    if (!isValidEmail(email)) {
        showNotification('Please enter a valid email address.', 'error');
        return;
    }

    // Prepare form submission
    const submitButton = this.querySelector('.btn-primary');
    const originalText = submitButton.textContent;

    submitButton.textContent = 'Sending...';
    submitButton.disabled = true;

    // EmailJS parameters
    const templateParams = {
        from_name: name,
        from_email: email,
        phone: phone || 'Not provided',
        service_interest: service,
        message: message
    };

    // Send email using EmailJS
    console.log('📤 Sending email with params:', templateParams);
    emailjs.send('service_jpgg8a6', 'template_roubhwk', templateParams)
        .then((response) => {
            console.log('✅ Email sent successfully!', response);
            showNotification('Thank you! Your message has been sent. We\'ll get back to you soon.', 'success');
            this.reset();
            submitButton.textContent = originalText;
            submitButton.disabled = false;
        })
        .catch((error) => {
            console.error('❌ EmailJS Error:', error);
            console.error('Error details:', {
                status: error.status,
                text: error.text,
                message: error.message
            });
            showNotification('Sorry, there was an error sending your message. Please try again.', 'error');
            submitButton.textContent = originalText;
            submitButton.disabled = false;
        });
});

// ===== UTILITY FUNCTIONS =====
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function showNotification(message, type = 'success') {
    // Remove existing notifications
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Add styles
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '16px 24px',
        borderRadius: '12px',
        color: 'white',
        fontWeight: '500',
        zIndex: '10000',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease',
        backgroundColor: type === 'success' ? '#10B981' : '#EF4444',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)'
    });

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// ===== SCROLL REVEAL SYSTEM =====
/**
 * Generic scroll-reveal: add class="reveal fade-up" (or fade-left/right/zoom-in)
 * to any element. Optionally add reveal-delay-1..5 for staggered timing.
 * The JS observer adds 'is-visible' when the element enters the viewport.
 */
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            // Keep observing so re-entry re-triggers (comment out unobserve to replay)
            // revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

// Section-header underline reveal
const headerObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('header-revealed');
        }
    });
}, { threshold: 0.3 });

document.addEventListener('DOMContentLoaded', () => {
    // Wire up all pre-marked reveal elements
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    // Section headers
    document.querySelectorAll('.section-header').forEach(el => headerObserver.observe(el));

    // ----- Programmatically assign reveal classes to key elements -----

    // About section
    const aboutContent = document.querySelector('.about-content');
    const aboutImage   = document.querySelector('.about-image');
    if (aboutContent) { aboutContent.classList.add('reveal', 'fade-left'); revealObserver.observe(aboutContent); }
    if (aboutImage)   { aboutImage.classList.add('reveal', 'fade-right', 'reveal-delay-2'); revealObserver.observe(aboutImage); }

    // Stat items — staggered fade-up
    document.querySelectorAll('.stat-item').forEach((el, i) => {
        el.classList.add('reveal', 'fade-up', `reveal-delay-${Math.min(i + 1, 5)}`);
        revealObserver.observe(el);
    });

    // Service cards — staggered zoom-in
    document.querySelectorAll('.service-card').forEach((el, i) => {
        el.classList.add('reveal', 'zoom-in', `reveal-delay-${Math.min(i + 1, 5)}`);
        revealObserver.observe(el);
    });

    // Testimonial cards — staggered fade-up
    document.querySelectorAll('.testimonial-card').forEach((el, i) => {
        el.classList.add('reveal', 'fade-up', `reveal-delay-${Math.min(i + 1, 5)}`);
        revealObserver.observe(el);
    });

    // Contact info & form
    const contactInfo = document.querySelector('.contact-info');
    const contactFormEl = document.querySelector('.contact-form');
    if (contactInfo)    { contactInfo.classList.add('reveal', 'fade-left');  revealObserver.observe(contactInfo); }
    if (contactFormEl)  { contactFormEl.classList.add('reveal', 'fade-right', 'reveal-delay-2'); revealObserver.observe(contactFormEl); }
});


// ===== COUNTER ANIMATION =====
function animateCounter(element, target, suffix, duration = 2000) {
    let current = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            current = target;
            clearInterval(timer);
            element.textContent = Math.floor(current) + suffix;
        } else {
            element.textContent = Math.floor(current);
        }
    }, 16);
}

// Animate counters when they come into view
const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const element = entry.target;
            const text = element.textContent;
            const number = parseInt(text.replace(/[^0-9]/g, ''));
            const suffix = text.replace(/[0-9]/g, '');

            if (number) {
                animateCounter(element, number, suffix);
                counterObserver.unobserve(element);
            }
        }
    });
}, { threshold: 0.5 });

document.addEventListener('DOMContentLoaded', () => {
    const statNumbers = document.querySelectorAll('.stat-item h4, .hero-card h3');
    statNumbers.forEach(stat => {
        counterObserver.observe(stat);
    });
});

// ===== SPOTLIGHT EFFECT ON SERVICE CARDS =====
/**
 * Each service card gets a .spotlight div injected. On mousemove we update
 * CSS custom properties --mx / --my so the radial gradient follows the cursor.
 */
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.service-card').forEach(card => {
        // Inject spotlight element
        const spot = document.createElement('div');
        spot.classList.add('spotlight');
        card.prepend(spot);

        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width)  * 100;
            const y = ((e.clientY - rect.top)  / rect.height) * 100;
            card.style.setProperty('--mx', `${x}%`);
            card.style.setProperty('--my', `${y}%`);
        });
    });
});


// ===== LAZY LOADING IMAGES =====
const imageObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                obs.unobserve(img);
            }
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('img[data-src]').forEach(img => imageObserver.observe(img));

    const modal = document.getElementById('infographic-modal');
    const modalImage = modal?.querySelector('.modal-image');
    const modalCaption = modal?.querySelector('.modal-caption');
    const closeButton = modal?.querySelector('.modal-close');
    const zoomInButton = modal?.querySelector('.zoom-in');
    const zoomOutButton = modal?.querySelector('.zoom-out');

    let zoomLevel = 1;
    const minZoom = 1;
    const maxZoom = 3;
    const zoomStep = 0.25;

    const updateZoom = (newZoom) => {
        zoomLevel = Math.min(maxZoom, Math.max(minZoom, newZoom));
        if (modalImage) {
            modalImage.style.transform = `scale(${zoomLevel})`;
            modalImage.classList.toggle('zoomed', zoomLevel > 1);
        }
    };

    const resetZoom = () => updateZoom(1);

    document.querySelectorAll('.expandable-flyer').forEach(img => {
        img.addEventListener('click', () => {
            if (!modal || !modalImage) return;
            modalImage.src = img.src;
            modalImage.alt = img.alt || 'Enlarged infographic';
            if (modalCaption) {
                modalCaption.textContent = img.alt || 'Infographic';
            }
            resetZoom();
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
        });
    });

    zoomInButton?.addEventListener('click', () => updateZoom(zoomLevel + zoomStep));
    zoomOutButton?.addEventListener('click', () => updateZoom(zoomLevel - zoomStep));

    modalImage?.addEventListener('wheel', (event) => {
        event.preventDefault();
        const direction = event.deltaY > 0 ? -zoomStep : zoomStep;
        updateZoom(zoomLevel + direction);
    });

    const closeModal = () => {
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        resetZoom();
    };

    closeButton?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal?.classList.contains('active')) {
            closeModal();
        }
        if (event.key === '+' && modal?.classList.contains('active')) {
            updateZoom(zoomLevel + zoomStep);
        }
        if ((event.key === '-' || event.key === '_') && modal?.classList.contains('active')) {
            updateZoom(zoomLevel - zoomStep);
        }
    });
});

// ===== ACCESSIBILITY IMPROVEMENTS =====
document.addEventListener('DOMContentLoaded', () => {
    // Add keyboard navigation for hamburger menu
    hamburger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            hamburger.click();
        }
    });

    // Add focus trap for mobile menu
    const focusableElements = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navMenu?.classList.contains('active')) {
            hamburger?.classList.remove('active');
            navMenu?.classList.remove('active');
            hamburger?.focus();
        }
    });
});

// ===== PERFORMANCE OPTIMIZATION =====
// Throttle scroll events
function throttle(func, limit) {
    let inThrottle;
    return function () {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// Use throttled scroll for navbar effect
const throttledScroll = throttle(() => {
    if (window.scrollY > 100) {
        navbar?.classList.add('scrolled');
    } else {
        navbar?.classList.remove('scrolled');
    }
}, 100);

window.addEventListener('scroll', throttledScroll);

// ===== HERO ENTRANCE ANIMATION =====
document.addEventListener('DOMContentLoaded', () => {
    const heroContent = document.querySelector('.hero-content');
    const heroImage   = document.querySelector('.hero-image');

    if (heroContent && heroImage) {
        heroContent.style.opacity = '0';
        heroContent.style.transform = 'translateY(30px)';
        heroImage.style.opacity = '0';
        heroImage.style.transform = 'translateY(30px)';

        setTimeout(() => {
            heroContent.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
            heroImage.style.transition   = 'opacity 0.8s ease, transform 0.8s ease';
            heroContent.style.opacity    = '1';
            heroContent.style.transform  = 'translateY(0)';

            setTimeout(() => {
                heroImage.style.opacity   = '1';
                heroImage.style.transform = 'translateY(0)';
            }, 200);
        }, 300);
    }
});


console.log('🌟 ACE Transitions  website loaded successfully!');