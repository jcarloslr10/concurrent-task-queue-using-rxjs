const {
  fromEvent,
  of,
  merge,
  map,
  Subject,
  asyncScheduler,
  Observable
} = rxjs;
const {
  startWith,
  endWith,
  takeUntil,
  connect,
  mergeMap,
  observeOn,
  scan,
  tap,
  filter,
  catchError
} = rxjs.operators;

const maxConcurrency = 2;

const htmlMaxConcurrencyElement = document.querySelector('#maxConcurrency');
htmlMaxConcurrencyElement.textContent = maxConcurrency;

const inProgressCountHtmlElement = document.querySelector('#inProgressCount');
const failedCountHtmlElement = document.querySelector('#failedCount');
const completedCountHtmlElement = document.querySelector('#completedCount');
const totalCountHtmlElement = document.querySelector('#totalCount');
const processesHtmlElement = document.querySelector('#processes');

let processId = 0;

const addProcess$ = new Subject();
const addProcessButton = document.querySelector('#addProcessBtn');
const addProcessButtonClick$ = fromEvent(addProcessButton, 'click')
  .subscribe(() => {
    addProcess$.next(newProcess(processId++))
  });

const dropProcess$ = new Subject();
const dropProcessButton = document.querySelector('#dropProcessBtn');
const dropProcessButtonClick$ = fromEvent(dropProcessButton, 'click')
  .subscribe(() => {
    dropProcess$.next({
      id: parseInt(document.querySelector('#dropProcessId').value),
      status: 'dropped'
    })
  });

const processQueue$ = addProcess$
  .pipe(
    connect(subject$ =>
      merge(
        subject$.pipe(
          mergeMap((process) => {
            return of(updateProcess(process, 'pending', 0))
              .pipe(
                observeOn(asyncScheduler),
                takeUntil(merge(subject$))
              );
          })
        ),
        subject$.pipe(
          mergeMap((process) => {
            return fakeHttpRequest(process)
              .pipe(
                startWith(updateProcess(process, 'in progress', 0)),
                endWith(updateProcess(process, 'completed', 100)),
                catchError((error) => of(updateProcess(process, 'failed', process.percentage))),
                scan((accum, value) => ({ ...accum, ...value }), {}),
                takeUntil(
                  dropProcess$.pipe(
                    filter(p => p.id === process.id)
                  )),
                tap(console.log)
              )
          }, maxConcurrency)
        )
      )
    )
  );

const droppableProcessQueue$ = merge(processQueue$, dropProcess$)
  .pipe(
    scan((accum, value) => {
      if (value.status === 'dropped') {
        const { [value.id]: _, ...rest } = accum;
        return rest;
      }
      return { ...accum, [value.id]: value };
    }, {}),
    map(obj => Object.values(obj))
  );

droppableProcessQueue$.subscribe(processes => {
  inProgressCountHtmlElement.textContent = processes.filter(p => p.status === 'in progress').length;
  failedCountHtmlElement.textContent = processes.filter(p => p.status === 'failed').length;
  completedCountHtmlElement.textContent = processes.filter(p => p.status === 'completed').length;
  totalCountHtmlElement.textContent = processes.length;
  processesHtmlElement.textContent = JSON.stringify(processes, undefined, 2);
});

const newProcess = (id) => ({
  id,
  status: 'not schedule',
  percentage: 0,
});

const updateProcess = (process, status, percentage) => ({
  ...process,
  status,
  percentage,
});

const fakeHttpDelay = 5000;
const fakeHttpRequest = (process) => new Observable(subscriber => {
  subscriber.next(updateProcess(process, 'in progress', 25));
  setTimeout(() => {
    subscriber.next(updateProcess(process, 'in progress', 50));

    if (Math.floor(Math.random() * 10) % 2 === 0)
      subscriber.error(new Error('Connection error!'));

    setTimeout(() => {
      subscriber.next(updateProcess(process, 'in progress', 75));
      setTimeout(() => {
        subscriber.next(updateProcess(process, 'in progress', 99));
        subscriber.complete();
      }, fakeHttpDelay);
    }, fakeHttpDelay);
  }, fakeHttpDelay);
});
