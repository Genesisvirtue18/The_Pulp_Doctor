import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Baby,
  Check,
  HeartHandshake,
  HeartPulse,
  Menu,
  MoveUpRight,
  ScanLine,
  ShieldCheck,
  Smile,
  Sparkles,
  Stethoscope,
  WandSparkles,
  X,
} from "lucide-react";
import { Link } from "wouter";

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function ToothArtwork() {
  return (
    <svg
      className="hero-tooth"
      viewBox="0 0 360 440"
      fill="none"
      role="img"
      aria-label="Illustration of a tooth"
    >
      <defs>
        <linearGradient
          id="toothBody"
          x1="75"
          y1="44"
          x2="285"
          y2="389"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" />
          <stop offset=".48" stopColor="#e7f3f1" />
          <stop offset="1" stopColor="#9ccac4" />
        </linearGradient>
        <linearGradient
          id="toothShade"
          x1="183"
          y1="152"
          x2="287"
          y2="374"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6eb7ae" stopOpacity="0" />
          <stop offset="1" stopColor="#246c73" stopOpacity=".56" />
        </linearGradient>
        <filter
          id="toothShadow"
          x="10"
          y="8"
          width="340"
          height="430"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feGaussianBlur stdDeviation="17" />
        </filter>
      </defs>
      <ellipse
        cx="180"
        cy="397"
        rx="116"
        ry="20"
        fill="#071f36"
        fillOpacity=".36"
        filter="url(#toothShadow)"
      />
      <path
        d="M180 56c-31-29-99-19-121 20-26 46-1 103 10 148 13 54 18 119 47 161 15 22 31 16 41-9 13-35 16-92 34-92s21 57 34 92c10 25 26 31 41 9 29-42 34-107 47-161 11-45 36-102 10-148-22-39-90-49-121-20Z"
        fill="url(#toothBody)"
        stroke="#fff"
        strokeWidth="7"
      />
      <path
        d="M180 56c31-29 99-19 121 20 26 46 1 103-10 148-13 54-18 119-47 161-15 22-31 16-41-9-13-35-16-92-34-92V56Z"
        fill="url(#toothShade)"
      />
      <path
        d="M92 115c15-30 48-43 77-35"
        stroke="#fff"
        strokeOpacity=".9"
        strokeWidth="11"
        strokeLinecap="round"
      />
      <path
        d="M111 177c12-18 30-27 50-29"
        stroke="#fff"
        strokeOpacity=".55"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand() {
  return (
    <Link href="/" className="brand-mark" aria-label="The Pulp Doctor home">
      <img src={`${import.meta.env.BASE_URL}logo.jpeg`} alt="The Pulp Doctor" />
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const links = [
    ["About", "/#about"],
    ["Treatments", "/#care"],
    ["Locations", "/#locations"],
    ["For dentists", "/refer-a-patient"],
    ["Contact", "/#contact"],
    ["Book appointment", "/#book"],
  ];
  return (
    <>
      <div className="topline px-5 py-2 text-center">
        Specialist endodontic care across Delhi NCR
      </div>
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Main navigation">
            {links.map(([label, href]) =>
              href === "/refer-a-patient" ? (
                <Link className="nav-link" key={label} href={href}>
                  {label}
                </Link>
              ) : (
                <a
                  className={
                    label === "Book appointment"
                      ? "btn-primary !px-5 !py-2.5 text-sm"
                      : "nav-link"
                  }
                  key={label}
                  href={href}
                >
                  {label}
                  {label === "Book appointment" && <ArrowRight size={15} />}
                </a>
              ),
            )}
          </nav>
          <button
            className="menu-toggle"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            data-testid="button-mobile-menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {open && (
          <nav className="mobile-nav" aria-label="Mobile navigation">
            {links.map(([label, href]) =>
              href === "/refer-a-patient" ? (
                <Link key={label} href={href} onClick={() => setOpen(false)}>
                  {label}
                </Link>
              ) : (
                <a key={label} href={href} onClick={() => setOpen(false)}>
                  {label}
                </a>
              ),
            )}
          </nav>
        )}
      </header>
    </>
  );
}

export function HeroSection() {
  return (
    <section className="hero px-5">
      <div className="hero-grid relative z-10 mx-auto grid min-h-[615px] max-w-[1160px] items-center gap-12 py-14 md:grid-cols-[1.12fr_.88fr]">
        <Reveal className="fade-up">
          <p className="eyebrow flex items-center gap-2">
            <span className="h-px w-7 bg-[#39867f]" /> Specialist endodontic
            care · Delhi NCR
          </p>
          <h1 className="serif mt-6 max-w-[730px] text-[clamp(3.5rem,7.4vw,6.4rem)] leading-[.88] tracking-[-.025em] text-[#153d50]">
            Preserving natural teeth through{" "}
            <em className="text-[#267d79]">expert</em> endodontic care.
          </h1>
          <p className="mt-7 max-w-[500px] text-lg leading-8 text-[#506c77]">
            A thoughtful, clear approach to specialist care—rooted in careful
            diagnosis and a conversation that starts with you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#book" className="btn-primary">
              Book an appointment <ArrowRight size={17} />
            </a>
            <Link href="/refer-a-patient" className="btn-outline">
              Refer a patient <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-9 flex items-center gap-3 text-sm text-[#4a6973]">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#32847c]">
              <Check size={16} />
            </span>
            <span>Personalised care, clear communication</span>
          </div>
        </Reveal>
        <Reveal className="relative mx-auto w-full max-w-[425px]">
          <div className="absolute -right-8 -top-7 h-32 w-32 rounded-full border border-[#9bc8c5]/70" />
          <div className="portrait-placeholder relative aspect-[.83] overflow-hidden rounded-t-[48%] rounded-b-[2rem] border-[10px] border-white/75 shadow-[0_24px_55px_rgba(31,76,83,.16)]">
            <img
              className="hero-portrait-image"
              src={`${import.meta.env.BASE_URL}drcharu.jpeg`}
              alt="Dr Charu Makhija"
            />
          </div>
          <div className="absolute -bottom-5 -left-10 rounded-2xl border border-[#d9e8e7] bg-white px-5 py-4 shadow-lg">
            <div className="serif text-3xl text-[#1c6570]">15+</div>
            <div className="text-[.68rem] font-semibold uppercase tracking-wider text-[#627a81]">
              years of experience
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function AboutSection() {
  return (
    <section id="about" className="about-premium section-pad">
      <div className="about-index">
        <span>01</span>
        <i />
      </div>
      <div className="about-layout">
        <Reveal className="about-heading">
          <p className="eyebrow">THE PERSON BEHIND THE PRACTICE</p>
          <h2 className="serif">
            Expert hands.
            <br />
            <em>Human care.</em>
          </h2>
          <div className="doctor-credentials">
            <strong>Dr Charu Makhija</strong>
            <span>BDS, MDS</span>
            <span>Restorative Dentist and Endodontist</span>
            <span>MBA (Hospital Management)</span>
          </div>
        </Reveal>
        <Reveal className="about-copy" delay={100}>
          <p>
            Dr Charu Makhija is an experienced Restorative Dentist and
            Endodontist with over 15 years of clinical experience. She is
            dedicated to helping patients preserve their natural teeth through
            careful diagnosis, advanced treatment techniques and gentle,
            personalised dental care.
          </p>
          <p>
            She completed her BDS and MDS in Conservative Dentistry and
            Endodontics and also holds an MBA, which complements her clinical
            expertise with a broader understanding of healthcare management and
            professional leadership. She remains actively involved in continuing
            education, research and academics.
          </p>
          <p>
            Known professionally through her copyrighted identity, “The Pulp
            Doctor,” Dr Makhija believes that quality dental care begins with
            trust and clear communication. She takes the time to listen to each
            patient’s concerns, explain treatment options in simple language and
            create a treatment plan that prioritises comfort, safety and
            long-term oral health.
          </p>
          <p>
            Alongside her clinical practice, Dr Makhija is a dedicated mentor
            and educator. She conducts lectures, hands-on workshops and clinical
            training programmes for dentists at different stages of their
            professional journeys.
          </p>
          <p>
            With a thoughtful approach, attention to detail and a genuine
            commitment to patient wellbeing, Dr Charu Makhija strives to make
            every patient feel heard, reassured and confident throughout their
            treatment journey.
          </p>
        </Reveal>
      </div>
      <div
        className="credential-ribbon"
        aria-label="Professional experience and credentials"
      >
        <div className="credential-stat">
          <span className="credential-index">01 / EXPERIENCE</span>
          <strong>15+</strong>
          <small>YEARS OF EXPERIENCE</small>
        </div>
        <div className="credential-stat">
          <span className="credential-index">02 / QUALIFICATION</span>
          <strong>BDS · MDS</strong>
          <small>CONSERVATIVE DENTISTRY &amp; ENDODONTICS</small>
        </div>
        <div className="credential-stat">
          <span className="credential-index">03 / MANAGEMENT</span>
          <strong>MBA</strong>
          <small>HOSPITAL MANAGEMENT</small>
        </div>
        <div className="credential-stat">
          <span className="credential-index">04 / APPROACH</span>
          <strong>TRUST</strong>
          <small>AT THE HEART OF CARE</small>
        </div>
      </div>
    </section>
  );
}

const services = [
  {
    name: "Dental Implants",
    description:
      "Options for replacing missing teeth and restoring everyday oral function.",
    image:
      "https://static.vecteezy.com/system/resources/previews/047/427/120/non_2x/dental-implant-icon-set-isolated-on-white-background-vector.jpg",
  },
  {
    name: "Braces and Teeth Aligners",
    description:
      "Orthodontic options, including clear aligners, to improve tooth alignment.",
    image:
      "https://static.vecteezy.com/system/resources/thumbnails/066/883/948/small/illustration-of-a-smiling-mouth-with-teeth-fitted-with-braces-orthodontic-treatment-for-dental-alignment-and-improved-oral-health-and-aesthetics-vector.jpg",
  },
  {
    name: "Veneers and Crowns",
    description:
      "Restorative options for selected tooth damage, shape, and appearance concerns.",
    image:
      "https://static.vecteezy.com/system/resources/previews/007/215/311/non_2x/veneer-linear-icon-thin-line-illustration-dental-crown-contour-symbol-isolated-outline-drawing-vector.jpg",
  },
  {
    name: "Smile Design",
    description:
      "Personalised options for improving smile appearance and overall aesthetics.",
    image:
      "https://static.vecteezy.com/system/resources/previews/066/884/002/non_2x/smiling-mouth-with-teeth-illustration-black-and-white-line-art-drawing-of-a-happy-smile-dental-health-and-hygiene-concept-design-element-vector.jpg",
  },
  {
    name: "Dentures and Bridges",
    description:
      "Options for replacing missing teeth based on individual dental needs.",
    image:
      "https://static.vecteezy.com/system/resources/previews/020/271/283/non_2x/dental-bridge-line-icon-orthodontic-teeth-implant-linear-pictogram-oral-care-stomatology-prosthesis-dentistry-outline-symbol-dental-treatment-sign-editable-stroke-isolated-illustration-vector.jpg",
  },
  {
    name: "Teeth Cleaning",
    description:
      "Professional cleaning to help manage plaque, tartar, and gum health.",
    image:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTfYs-dQW4ZnC8RptE2Dt9kQgezFtHqdBX4E-zygAJ2eQ&s=10",
  },
  {
    name: "Teeth Whitening",
    description:
      "Discuss suitable whitening options for discoloured or stained teeth.",
    image:
      "https://png.pngtree.com/png-vector/20220518/ourmid/pngtree-tooth-clean-line-icon-care-cartoon-flat-vector-png-image_46134552.jpg",
  },
  {
    name: "Laser Dentistry",
    description:
      "Laser-assisted procedures where appropriate for the clinical indication.",
    image: "https://candcdental.com/wp-content/uploads/2024/10/2679899.webp",
  },
  {
    name: "Oral Surgery",
    description:
      "Assessment and surgical care for selected oral and dental conditions.",
    image:
      "https://www.shutterstock.com/image-vector/maxillofacial-surgeon-outline-icon-vector-260nw-2519836419.jpg",
  },
  {
    name: "Paediatric Dentistry",
    description:
      "Dental assessment and care tailored to children's oral health needs.",
    image:
      "https://www.shutterstock.com/image-vector/vector-line-icon-pediatric-dentistry-260nw-2669071519.jpg",
  },
];

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: "grid",
    gap: "24px",
    marginTop: "42px",
  },
  card: {
    overflow: "hidden",
    border: "1px solid #e1e9e9",
    borderRadius: "18px",
    background: "#fff",
    boxShadow: "0 4px 16px rgba(23,63,81,0.04)",
    transition: "transform 280ms ease, box-shadow 280ms ease",
  },
  image: {
    display: "block",
    width: "100%",
    height: "210px",
    objectFit: "cover",
  },
  content: {
    padding: "22px",
  },
  title: {
    color: "#173f51",
    fontSize: "19px",
    fontWeight: 600,
    lineHeight: 1.4,
    margin: 0,
  },
  description: {
    marginTop: "10px",
    color: "#5a737b",
    fontSize: "14px",
    lineHeight: 1.8,
  },
};

export function TreatmentsSection() {
  return (
    <section
      id="care"
      style={{
        padding: "90px 4%",
        background: "#ebf5f5",
      }}
    >
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <Reveal>
          <div
            style={{
              marginBottom: "34px",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: "24px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <p
                style={{
                  color: "#347e83",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "2px",
                  marginBottom: "12px",
                }}
              >
                SPECIALIST ENDODONTIC CARE
              </p>

              <h2
                className="treatments-section-title"
                style={{
                  color: "#102d44",
                  fontFamily: "var(--app-font-serif)",
                  fontSize: "clamp(2.6rem, 5vw, 4.3rem)",
                  fontWeight: 300,
                  lineHeight: 0.86,
                  letterSpacing: "-.035em",
                  margin: 0,
                }}
              >
                Treatments &amp; Services
              </h2>
            </div>

            <p
              style={{
                maxWidth: "420px",
                color: "#45596b",
                fontSize: "16px",
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              Personalised dental care guided by careful diagnosis, clinical
              expertise, and a focus on preserving natural teeth.
            </p>
          </div>
        </Reveal>

        <div className="treatment-reference-grid">
          {services.map(({ name, description, image }, index) => (
            <Reveal key={name} delay={(index % 3) * 50}>
              <a
                href="#book"
                aria-label={`Discuss ${name} at an appointment`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "16px",
                  height: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                  padding: "16px",
                  background: "#fff",
                  border: "1px solid rgba(23, 63, 81, 0.06)",
                  borderRadius: "17px",
                  boxShadow: "0 2px 8px rgba(23,63,81,0.025)",
                  textDecoration: "none",
                  color: "inherit",
                  transition:
                    "transform 250ms ease, box-shadow 250ms ease, border-color 250ms ease",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.transform = "translateY(-3px)";
                  event.currentTarget.style.borderColor = "#8bbdb7";
                  event.currentTarget.style.boxShadow =
                    "0 10px 26px rgba(23,63,81,0.09)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = "translateY(0)";
                  event.currentTarget.style.borderColor = "rgba(23,63,81,0.06)";
                  event.currentTarget.style.boxShadow =
                    "0 2px 8px rgba(23,63,81,0.025)";
                }}
              >
                <img
                  src={image}
                  alt={name}
                  loading="lazy"
                  style={{
                    width: "132px",
                    height: "104px",
                    flexShrink: 0,
                    objectFit: "cover",
                    borderRadius: "13px",
                    background: "#e9f2f2",
                  }}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3
                    style={{
                      color: "#12385b",
                      fontSize: "19px",
                      fontWeight: 700,
                      lineHeight: 1.35,
                      margin: "1px 0 9px",
                    }}
                  >
                    {name}
                  </h3>

                  <p
                    style={{
                      color: "#40536b",
                      fontSize: "15px",
                      lineHeight: 1.65,
                      margin: 0,
                    }}
                  >
                    {description}
                  </p>
                </div>
              </a>
            </Reveal>
          ))}
        </div>

        <style>
          {`
            .treatment-reference-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 20px;
              align-items: stretch;
            }

            @media (max-width: 1050px) {
              .treatment-reference-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 16px;
              }
            }

            @media (max-width: 650px) {
              .treatment-reference-grid {
                grid-template-columns: 1fr;
                gap: 13px;
              }

              .treatment-reference-grid a {
                gap: 12px !important;
                padding: 12px !important;
              }

              .treatment-reference-grid img {
                width: 94px !important;
                height: 88px !important;
              }

              .treatment-reference-grid h3 {
                font-size: 16px !important;
              }

              .treatment-reference-grid p {
                font-size: 13px !important;
                line-height: 1.5 !important;
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .treatment-reference-grid a {
                transition: none !important;
              }
            }
          `}
        </style>
      </div>
    </section>
  );
}

export function DentistReferralSection() {
  return (
    <section className="referral-premium section-pad">
      <Reveal className="referral-card">
        <div className="referral-copy">
          <p className="eyebrow !text-[#89c9bd]">FOR REFERRING DENTISTS</p>
          <h2 className="serif">
            A considered referral.
            <br />
            <em>A clear handover.</em>
          </h2>
          <p>
            Share the clinical context, tooth details and restorative plan
            securely. The referral form includes an interactive FDI chart and a
            review step.
          </p>
          <Link href="/refer-a-patient" className="btn-mint">
            Refer a patient <ArrowRight size={16} />
          </Link>
        </div>
        <div className="referral-stamp">
          <span>32</span>
          <small>
            TEETH
            <br />
            FDI CHART
          </small>
          <div className="stamp-ring" />
        </div>
      </Reveal>
    </section>
  );
}



export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <a
            href="/#top"
            aria-label="The Pulp Doctor home"
            className="mb-4 inline-flex items-center"
          >
            <img
              src="/footer-logo.png"
              alt="The Pulp Doctor"
              className="h-auto w-36 max-w-full object-contain sm:w-44"
            />
          </a>

          <p>
            Specialist endodontic care with time to listen, explain and plan.
          </p>

          <span>
            Dr Charu Makhija · Restorative Dentist and Endodontist
          </span>
        </div>

        <div>
          <p className="eyebrow !text-[#83c5ba]">EXPLORE</p>
          <nav className="footer-links">
            <a href="/#about">About Dr Makhija</a>
            <a href="/#care">Treatments</a>
            <Link href="/refer-a-patient">Refer a patient</Link>
            <a href="/#book">Appointments</a>
            <a href="/#locations">Clinic locations</a>
          </nav>
        </div>

        <div>
          <p className="eyebrow !text-[#83c5ba]">CONTACT</p>
          <p className="footer-contact">
            For clinic details and appointment availability, please select a
            location below.
          </p>
          <Link href="/admin/login" className="admin-link">
            Administrator sign in
          </Link>
        </div>
      </div>

      <div className="footer-bottom relative flex flex-col items-center justify-between gap-3 text-center md:flex-row">
        <span className="text-xs">
          © {new Date().getFullYear()} The Pulp Doctor. All rights reserved.
        </span>

        <a
          href="https://www.genesisvirtue.com"
          target="_blank"
          rel="noopener noreferrer"
          className="powered-by text-xs text-center no-underline transition-opacity hover:opacity-100"
        >
          Powered by <strong>Genesis Virtue</strong>
        </a>

        <a href="#top" className="text-xs">
          BACK TO TOP ↑
        </a>
      </div>
    </footer>
  );
}
