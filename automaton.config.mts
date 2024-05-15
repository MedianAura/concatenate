import { defineConfig, getVersionPrompt } from '@medianaura/automaton';

export default defineConfig({
  jobs: [
    {
      id: 'version',
      name: 'Create a new version',
      prompts: [getVersionPrompt],
      actions: [
        {
          type: 'run',
          run: (answers) => {
            if (!answers.confirm) {
              process.exit(4);
            }
          },
        },
        {
          type: 'cmd',
          cmd: 'npm run build',
        },
        {
          type: 'cmd',
          cmd: 'npm version --force --no-git-tag-version %(version)s',
        },
        {
          type: 'cmd',
          cmd: 'git add .',
        },
        {
          type: 'cmd',
          cmd: 'git commit -m "doc: mise à jour pour la version %(version)s"',
        },
        {
          type: 'cmd',
          cmd: 'git tag -a v%(version)s -m "doc: creation de la version %(version)s"',
        },
        {
          type: 'cmd',
          cmd: 'git push',
        },
        {
          type: 'cmd',
          cmd: 'git push --tags --no-verify',
        },
        {
          type: 'cmd',
          cmd: 'npm publish --access public',
        },
      ],
    },
  ],
});
