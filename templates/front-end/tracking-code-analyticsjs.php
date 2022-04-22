<?php
/**
 * The template for analytics.js code
 *
 * @package WP Analytics Tracking Generator
 */
?>
<!-- Begin WP Analytics Tracking Generator analytics.js code -->
<style>.async-hide { opacity: 0 !important} </style>
<script>
(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');
ga( 'create', '<?php echo esc_attr( $property_id ); ?>', 'auto' );
<?php if ( true !== $disable_optimize && '' !== $optimize_id ) : ?>
ga( 'require', '<?php echo esc_attr( $optimize_id ); ?>' );
<?php endif; ?>
<?php if ( ! empty( $custom_dimensions ) ) : ?>
<?php foreach ( $custom_dimensions as $key => $value ) : ?>
ga( 'set', 'dimension<?php echo esc_attr( $key ); ?>', '<?php echo esc_html( $value ); ?>' );
<?php endforeach; ?>
<?php endif; ?>
<?php if ( true !== $disable_pageview ) : ?>
ga('send', 'pageview');
<?php endif; ?>
</script>
<?php if ( '' !== $google_ads_id ) : ?>
<!-- Global site tag (gtag.js) - Google Ads: <?php echo esc_attr( $google_ads_id ); ?> -->
<script async src="https://www.googletagmanager.com/gtag/js?id=<?php echo esc_attr( $google_ads_id ); ?>"></script>
<script> window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date()); gtag('config', '<?php echo esc_attr( $google_ads_id ); ?>');
<?php if ( false === $enable_extra_reports ) : ?>
gtag('set', 'allow_ad_personalization_signals', false);
<?php endif; ?>
</script>
<?php endif; ?>
<!-- End WP Analytics Tracking Generator analytics.js code -->
