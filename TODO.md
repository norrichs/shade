## SuperGlobule updates

### Restore pattern making from superglobules

- Prioritized. I want to make a steel frame hex pattern
- Optimizations to pattern calculation based on what is meant to be displayed

### Changes to config

- give each top level globule config (subGlobule, projection) an array of roles
  - `generate-pattern`
  - `generate-geometry`

## Changes to calculation

- use new Address scheme
- addresses will have to be refactored completely
- instead of `projection`, should we use `globule`?
- instead of `subGlobule`, should we use `tube`?
- `gtbfe`
- where does recombination fit in?

### Changes to display logic

### Changes to controls

- Transition all relevant controls to new "Floater" scheme
- Increase button visibility
- Implement nested floating sidebar buttons, with sticky "open" / "collapsed" states
- Implement reusable pattern for making local changes with debounced or explicit recalculation

### Saving

- start over with config saving to database and/or files
- just use json. granularity is not useful here
