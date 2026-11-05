import { ExchangeRateWarning } from '@ghostfolio/common/interfaces';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import '@angular/localize/init';

import { GfFxRateWarningComponent } from './fx-rate-warning.component';

describe('GfFxRateWarningComponent', () => {
  let fixture: ComponentFixture<GfFxRateWarningComponent>;

  const estimated: ExchangeRateWarning = {
    currencyFrom: 'CHF',
    currencyTo: 'USD',
    date: '2021-12-04',
    type: 'ESTIMATED'
  };

  const missing: ExchangeRateWarning = {
    currencyFrom: 'GBP',
    currencyTo: 'USD',
    date: '2021-11-30',
    type: 'MISSING'
  };

  function render(fxWarnings: ExchangeRateWarning[] | undefined) {
    fixture.componentRef.setInput('fxWarnings', fxWarnings);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GfFxRateWarningComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(GfFxRateWarningComponent);
  });

  it('renders nothing without warnings', () => {
    expect(render([]).querySelector('.fx-rate-warning')).toBeNull();
  });

  it('renders nothing when the warnings are undefined', () => {
    expect(render(undefined).querySelector('.fx-rate-warning')).toBeNull();
  });

  it('announces the warnings in a status region', () => {
    const element = render([estimated]);

    expect(
      element.querySelector('.fx-rate-warning')?.getAttribute('role')
    ).toBe('status');
  });

  it('lists an estimated rate with its currency pair and date, and no missing section', () => {
    const element = render([estimated]);
    const sections = element.querySelectorAll('details');

    expect(sections).toHaveLength(1);
    expect(sections[0].textContent).toContain('Estimated exchange rates');
    expect(sections[0].textContent).toContain('(1)');
    expect(sections[0].textContent).toContain('CHF/USD');
    expect(sections[0].textContent).toContain('2021-12-04');
    expect(element.textContent).not.toContain('Missing exchange rates');
  });

  it('lists a missing rate with its currency pair and date, and no estimated section', () => {
    const element = render([missing]);
    const sections = element.querySelectorAll('details');

    expect(sections).toHaveLength(1);
    expect(sections[0].textContent).toContain('Missing exchange rates');
    expect(sections[0].textContent).toContain('GBP/USD');
    expect(sections[0].textContent).toContain('2021-11-30');
    expect(element.textContent).not.toContain('Estimated exchange rates');
  });

  it('shows missing rates before estimated rates, each with its own count', () => {
    const element = render([
      estimated,
      { ...estimated, date: '2021-12-05' },
      missing
    ]);

    const sections = Array.from(element.querySelectorAll('details'));

    expect(sections).toHaveLength(2);
    expect(sections[0].textContent).toContain('Missing exchange rates');
    expect(sections[0].textContent).toContain('(1)');
    expect(sections[1].textContent).toContain('Estimated exchange rates');
    expect(sections[1].textContent).toContain('(2)');
    expect(sections[1].querySelectorAll('li')).toHaveLength(2);
  });

  it('uses native disclosure elements so that the lists work with the keyboard', () => {
    const element = render([estimated, missing]);

    expect(element.querySelectorAll('details > summary')).toHaveLength(2);
  });

  it('updates when the warnings change', () => {
    const element = render([estimated]);

    expect(element.querySelectorAll('li')).toHaveLength(1);

    render([estimated, missing]);

    expect(element.querySelectorAll('li')).toHaveLength(2);

    render([]);

    expect(element.querySelector('.fx-rate-warning')).toBeNull();
  });
});
