<?php
/**
 * The template for gtag.js code
 *
 * @package WP Analytics Tracking Generator
 */
?>
<!-- Begin WP Analytics Tracking Generator gtag.js code -->
<script async src="https://www.googletagmanager.com/gtag/js?id=<?php echo $property_id; ?>"></script>
<script>
	window.dataLayer = window.dataLayer || [];
	function gtag(){dataLayer.push(arguments);}
	gtag('js', new Date());
	<?php if ( true !== $disable_pageview ) : ?>
	gtag('config', '<?php echo $property_id; ?>');
	<?php else : ?>
	gtag('config', '<?php echo $property_id; ?>', { 'send_page_view': false });
	<?php endif; ?>
</script>
<!-- End WP Analytics Tracking Generator gtag.js code -->
