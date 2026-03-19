import { config, collection, singleton, fields } from '@keystatic/core'

export default config({
  storage: {
    kind: 'github',
    repo: { owner: 'weslawrence', name: 'navhub-app' },
  },

  // ─── Singletons ────────────────────────────────────────────────────────────
  singletons: {
    marketing: singleton({
      label: 'Marketing Homepage',
      path:  'content/marketing/',
      schema: {
        heroHeadline: fields.text({
          label:       'Hero Headline',
          description: 'Main headline shown in the hero section',
        }),
        heroSubheadline: fields.text({
          label:       'Hero Subheadline',
          description: 'Supporting text below the main headline',
          multiline:   true,
        }),
        ctaPrimary: fields.text({
          label:       'Primary CTA Label',
          description: 'Label for the primary call-to-action button',
        }),
        ctaSecondary: fields.text({
          label:       'Secondary CTA Label',
          description: 'Label for the secondary call-to-action button',
        }),
        problemStatement: fields.text({
          label:       'Problem Statement',
          description: 'Bold statement in the "The Problem" section',
          multiline:   true,
        }),
      },
    }),
  },

  // ─── Collections ───────────────────────────────────────────────────────────
  collections: {
    posts: collection({
      label:     'Blog Posts',
      slugField: 'title',
      path:      'content/posts/**',
      format:    { contentField: 'content' },
      schema: {
        title: fields.slug({
          name: { label: 'Title' },
        }),
        publishedAt: fields.date({
          label:       'Published At',
          description: 'Date this post was published',
        }),
        summary: fields.text({
          label:       'Summary',
          description: 'Short summary shown in post listings',
          multiline:   true,
        }),
        content: fields.markdoc({
          label: 'Content',
        }),
      },
    }),
  },
})
