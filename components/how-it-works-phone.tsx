import { OssiPortrait } from "./ossi-portrait";

export function HowItWorksPhone() {
  return (
    <div className="help-phone-visual" data-testid="how-it-works-phone" aria-hidden="true">
      <div className="help-phone">
        <span className="help-phone-sensor" />
        <div className="help-phone-screen">
          <span className="help-phone-status">
            <span />
            Bereit
          </span>
          <div className="help-phone-portrait">
            <OssiPortrait variant="heading" decorative />
          </div>
          <span className="help-phone-name">Ossi</span>
          <span className="help-phone-caption">Bereit für dein Training</span>
          <span className="help-phone-call">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M7.1 3.6 9.5 8 7.8 9.8c1.2 2.4 3.1 4.3 5.5 5.5l1.8-1.7 4.4 2.4-.8 3.3c-.2.8-.9 1.3-1.7 1.3C9.5 20.6 3.4 14.5 3.4 7c0-.8.5-1.5 1.3-1.7l2.4-.7Z" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
