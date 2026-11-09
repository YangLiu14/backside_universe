"""Exercise the public album in iOS Safari using Apple's native WebDriver."""
import argparse
import os
import time

from selenium import webdriver
from selenium.common.exceptions import InvalidSessionIdException, SessionNotCreatedException, WebDriverException
from selenium.webdriver.common.actions.action_builder import ActionBuilder
from selenium.webdriver.common.actions.pointer_input import PointerInput
from selenium.webdriver.common.by import By
from selenium.webdriver.safari.service import Service
from selenium.webdriver.support.ui import WebDriverWait


def activate(driver, selector, native_touch):
    element = driver.find_element(By.CSS_SELECTOR, selector)
    if not native_touch:
        # Use the regular click handler even if SafariDriver's touch lands in browser chrome.
        driver.execute_script('arguments[0].click()', element)
        return
    driver.execute_script("arguments[0].scrollIntoView({block:'center',behavior:'instant'})", element)

    def target(d):
        return d.execute_script("""
            const el=arguments[0], r=el.getBoundingClientRect();
            const x=Math.floor(r.left+r.width/2), y=Math.floor(r.top+r.height/2);
            return el.contains(document.elementFromPoint(x,y)) ? [x,y] : null;
        """, element)

    x, y = WebDriverWait(driver, 10).until(target, f'{selector}: touch target is covered or outside the viewport')
    finger = ActionBuilder(driver, mouse=PointerInput("touch", "finger"))
    finger.pointer_action.move_to_location(x, y).pointer_down().pause(.1).pointer_up()
    finger.perform()


def check(driver, args):
    works = args.works or ['desk', 'canine', 'desk']
    driver.set_page_load_timeout(args.timeout)
    print('Opening', args.origin, ('#' + works[0]) if args.deep_link else 'album', flush=True)
    driver.get(args.origin.rstrip('/') + ('/#' + works[0] if args.deep_link else '/'))
    wait = WebDriverWait(driver, args.timeout, poll_frequency=.5)
    wait.until(lambda d: d.execute_script("return !!document.querySelector('[data-work]') && document.querySelector('.preview-switch')?.hidden===false"),
               'Safari lost the album or it never opened')
    album_start = driver.execute_script('return performance.timeOrigin')
    loaded_frames = {}
    for i, work in enumerate(works):
        started = time.monotonic()
        print('Testing', work, flush=True)
        if i or not args.deep_link:
            activate(driver, f'[data-work="{work}"]', args.native_touch)
            wait.until(lambda d: d.execute_script('return location.hash') == '#' + work,
                       f'{work}: tapping the photo did not open its route')
        frame_start = None
        last_status = None

        def scene_state(d):
            nonlocal frame_start, last_status
            state = d.execute_script("""
                const key=arguments[0], frame=document.querySelector('[data-screening-room="'+key+'"]');
                const doc=frame?.contentDocument;
                const loaded=doc && doc.URL !== 'about:blank';
                return {
                  album:performance.timeOrigin, frame:loaded ? frame.contentWindow.performance.timeOrigin : null,
                  ready:!!doc?.querySelector(key==='desk'?'#world[data-ready=true]':'#stage[data-ready=true]'),
                  browsing:!!doc?.querySelector('#stage[data-browsing=true]'),
                  error:!!doc?.querySelector('#loading[data-error=true],#retry-film:not([hidden])'),
                  mobileModel:loaded && frame.contentWindow.performance.getEntriesByType('resource').some(entry=>{
                      const path = new URL(entry.name).pathname;
                      return key==='desk' ? path.includes('/desk-mobile/') && path.endsWith('.glb')
                                          : path.endsWith('/hi3d-orbit-mobile.glb');
                  }),
                  status:doc?.querySelector('#status,#hint')?.textContent || '',
                  percent:doc?.querySelector('#load-value')?.textContent || ''
                };
            """, work)
            if state['album'] != album_start or (frame_start and state['frame'] != frame_start):
                raise RuntimeError(f'{work}: Safari reloaded the document during the test (last stage: {last_status})')
            if state['frame']:
                frame_start = state['frame']
            if state['status'] and state['status'] != last_status:
                last_status = state['status']
                print(f'{work} +{time.monotonic()-started:.1f}s {last_status} {state["percent"]}', flush=True)
            if state['error']:
                raise RuntimeError(f'{work}: scene reported a loading error ({last_status})')
            return state

        wait.until(lambda d: scene_state(d)['ready'], f'{work}: did not reach its ready state')
        loaded = scene_state(driver)
        if not loaded['mobileModel']:
            raise RuntimeError(f'{work}: no mobile GLB was loaded in iPhone Safari')
        if work in loaded_frames and loaded_frames[work] != loaded['frame']:
            raise RuntimeError(f'{work}: Safari recreated the scene on reentry')
        loaded_frames[work] = loaded['frame']
        print(f'{work} ready in {time.monotonic()-started:.1f}s', flush=True)

        def tap_in_scene(selector):
            frame = driver.find_element(By.CSS_SELECTOR, f'iframe[data-screening-room="{work}"]')
            driver.switch_to.frame(frame)
            try:
                activate(driver, selector, args.native_touch)
            finally:
                driver.switch_to.default_content()

        if not scene_state(driver)['browsing']:
            tap_in_scene('#play' if work == 'desk' else '#turn')
            wait.until(lambda d: scene_state(d)['browsing'], f'{work}: could not enter interactive view')
        tap_in_scene('[data-album-back]')
        wait.until(lambda d: d.execute_script("return !location.hash && !document.querySelector('#album')?.hidden"))
        print(f'{work}: interacted and returned to the album', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--simulator', action='store_true', help='Use iOS Simulator (default: a physical iPhone)')
    parser.add_argument('--device-name', help='Name of a paired phone or available simulator')
    parser.add_argument('--origin', default='https://backside-universe.netlify.app')
    parser.add_argument('--deep-link', action='store_true', help='Start with the first scene hash already in the URL')
    parser.add_argument('--native-touch', action='store_true', help='Use WebDriver touch input to activate controls')
    parser.add_argument('--timeout', type=int, default=240, help='Maximum seconds per scene transition')
    parser.add_argument('works', nargs='*', metavar='desk|canine')
    args = parser.parse_args()
    if any(work not in ('desk', 'canine') for work in args.works) or args.timeout <= 0:
        parser.error('Use desk or canine and a positive timeout')
    options = webdriver.SafariOptions()
    options.platform_name = 'iOS'
    options.page_load_strategy = 'eager'
    options.set_capability('safari:deviceType', 'iPhone')
    options.set_capability('safari:useSimulator', args.simulator)
    if args.device_name:
        options.set_capability('safari:deviceName', args.device_name)
    # SafariDriver listens on loopback, including when Safari itself is on a phone.
    bypass = os.environ.get('no_proxy', os.environ.get('NO_PROXY', ''))
    os.environ['no_proxy'] = ','.join(filter(None, [bypass, 'localhost', '127.0.0.1', '::1']))
    service = Service(executable_path='/usr/bin/safaridriver')
    try:
        service.start()
        # A newly started SafariDriver may still be discovering USB devices.
        deadline = time.monotonic() + 15
        while True:
            try:
                driver = webdriver.Remote(command_executor=service.service_url, options=options)
                break
            except SessionNotCreatedException:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(1)
        with driver:
            caps = driver.capabilities
            print(caps.get('safari:deviceType'), caps.get('safari:platformVersion'), 'simulator' if args.simulator else 'physical', flush=True)
            check(driver, args)
    except InvalidSessionIdException:
        raise SystemExit('Safari ended the automation session. Compare the last stage and time with WebContent/GPU device logs.') from None
    except WebDriverException as error:
        raise SystemExit('Safari test failed: ' + (error.msg or type(error).__name__)) from None
    finally:
        service.stop()


if __name__ == '__main__':
    main()
