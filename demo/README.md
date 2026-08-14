# Example service

A small, self-contained set of sources whose only job is to give the extension a realistic
file tree to work against: a few directories, a few levels of nesting, and a mix of file
types.

Nothing here is compiled, imported by the extension, or shipped. `tsconfig.json` covers `src`
only, so these files are invisible to the build.

```
demo/src/
  api/         a request helper and the routes built on it
  components/  two React components that consume those routes
  lib/         formatting, dates, validation
```
