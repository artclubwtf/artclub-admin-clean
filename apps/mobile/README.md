# Artclub Mobile (Expo + EAS)

## iOS TestFlight (EAS)

1) Log in:

```sh
eas login
```

2) Build iOS (preview profile):

```sh
eas build -p ios --profile preview
```

3) Submit latest build to TestFlight:

```sh
eas submit -p ios --latest
```
